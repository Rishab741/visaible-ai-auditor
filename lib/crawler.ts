import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

export interface PageStructuralSignals {
  h1Count: number;
  headingCounts: Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', number>;
  listCount: number;
  tableCount: number;
  paragraphCount: number;
  wordCount: number;
  /** Word count of the longest single paragraph block — a proxy for "wall of text" that buries facts. */
  longestBlockWords: number;
}

export type DetectedCms = 'wordpress' | 'unknown';

export interface ExtractedPageData {
  url: string;
  title: string;
  markdown: string;
  schemaJsonLd: unknown[];
  signals: PageStructuralSignals;
  cms: DetectedCms;
}

/** Cheap, static-HTML-only CMS fingerprint — good enough to steer "how would I actually apply this fix" without any authenticated access. */
function detectCms(html: string): DetectedCms {
  if (/wp-content\/|wp-includes\/|wp-json\/|name=["']generator["']\s+content=["']WordPress/i.test(html)) {
    return 'wordpress';
  }
  return 'unknown';
}

const UA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

function extractJsonLd($: CheerioAPI): unknown[] {
  const schemaJsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      schemaJsonLd.push(JSON.parse($(el).html() || '{}'));
    } catch {
      // Ignore malformed json-ld blocks
    }
  });
  return schemaJsonLd;
}

function extractStructuralSignals($: CheerioAPI): PageStructuralSignals {
  const headingCounts = {
    h1: $('h1').length,
    h2: $('h2').length,
    h3: $('h3').length,
    h4: $('h4').length,
    h5: $('h5').length,
    h6: $('h6').length,
  };

  const paragraphWordCounts = $('p')
    .map((_, el) => $(el).text().trim().split(/\s+/).filter(Boolean).length)
    .get();

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  return {
    h1Count: headingCounts.h1,
    headingCounts,
    listCount: $('ul, ol').length,
    tableCount: $('table').length,
    paragraphCount: paragraphWordCounts.length,
    wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
    longestBlockWords: paragraphWordCounts.length > 0 ? Math.max(...paragraphWordCounts) : 0,
  };
}

// No timeout here previously meant a single slow page (common on
// image/JS-heavy sites) could hold up its entire crawl batch indefinitely —
// this is what was eating most of the 60s Vercel budget on the crawl phase
// alone, leaving too little for the LLM analysis call that has to run after
// it. Bounding each attempt keeps a bad page from silently consuming the
// whole request's time; it still gets attempted, it just can't hang.
const FETCH_TIMEOUT_MS = 15_000;

async function fetchWithRetry(url: string, init: RequestInit, retries = 1): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.ok || attempt === retries) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError =
        err instanceof Error && err.name === 'AbortError'
          ? new Error(`Timed out after ${FETCH_TIMEOUT_MS}ms: ${url}`)
          : err;
    } finally {
      clearTimeout(timeoutId);
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Crawls a target URL and extracts clean Markdown, JSON-LD structured data,
 * and deterministic structural signals (heading structure, list/table usage,
 * paragraph density) used by the rules-based scoring engine in lib/signals.ts.
 * Falls back to standard fetch + cheerio if Firecrawl API key is omitted.
 */
export async function crawlBusinessPage(targetUrl: string): Promise<ExtractedPageData> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;

  // Use Firecrawl if available for high-quality markdown extraction
  if (firecrawlKey && firecrawlKey.trim() !== '') {
    try {
      const response = await fetchWithRetry('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firecrawlKey}`,
        },
        body: JSON.stringify({
          url: targetUrl,
          formats: ['markdown', 'html'],
        }),
      });

      const data = await response.json();
      if (data.success && data.data) {
        const $ = cheerio.load(data.data.html || '');

        return {
          url: targetUrl,
          title: $('title').text() || targetUrl,
          markdown: data.data.markdown || '',
          schemaJsonLd: extractJsonLd($),
          signals: extractStructuralSignals($),
          cms: detectCms(data.data.html || ''),
        };
      }
    } catch (error) {
      console.warn('Firecrawl API failed, falling back to standard fetch/cheerio:', error);
    }
  }

  // Free built-in fallback: Standard fetch + Cheerio
  const res = await fetchWithRetry(targetUrl, { headers: UA_HEADERS });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${targetUrl} (Status: ${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const schemaJsonLd = extractJsonLd($);
  const signals = extractStructuralSignals($);

  // Remove noise tags to clean up markdown text (after structural signals are captured)
  $('script, style, nav, footer, header, noscript').remove();

  const title = $('title').text().trim() || targetUrl;
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  return {
    url: targetUrl,
    title,
    markdown: bodyText,
    schemaJsonLd,
    signals,
    cms: detectCms(html),
  };
}
