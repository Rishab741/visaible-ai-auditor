import * as cheerio from 'cheerio';

export interface ExtractedPageData {
  url: string;
  title: string;
  markdown: string;
  schemaJsonLd: any[];
}

/**
 * Crawls a target URL and extracts clean Markdown and JSON-LD structured data.
 * Falls back to standard fetch + cheerio if Firecrawl API key is omitted.
 */
export async function crawlHotelPage(targetUrl: string): Promise<ExtractedPageData> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;

  // Use Firecrawl if available for high-quality markdown extraction
  if (firecrawlKey && firecrawlKey.trim() !== '') {
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
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
        const jsonLdScripts = $('script[type="application/ld+json"]');
        const schemaJsonLd: any[] = [];
        
        jsonLdScripts.each((_, el) => {
          try {
            const parsed = JSON.parse($(el).html() || '{}');
            schemaJsonLd.push(parsed);
          } catch (e) {
            // Ignore malformed json-ld blocks
          }
        });

        return {
          url: targetUrl,
          title: $('title').text() || targetUrl,
          markdown: data.data.markdown || '',
          schemaJsonLd,
        };
      }
    } catch (error) {
      console.warn('Firecrawl API failed, falling back to standard fetch/cheerio:', error);
    }
  }

  // Free built-in fallback: Standard fetch + Cheerio
  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${targetUrl} (Status: ${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Extract JSON-LD schemas
  const schemaJsonLd: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() || '{}');
      schemaJsonLd.push(parsed);
    } catch (e) {
      // Ignore
    }
  });

  // Remove noise tags to clean up markdown text
  $('script, style, nav, footer, header, noscript').remove();
  
  const title = $('title').text().trim() || targetUrl;
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  return {
    url: targetUrl,
    title,
    markdown: bodyText,
    schemaJsonLd,
  };
}