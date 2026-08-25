import * as cheerio from 'cheerio';

// Prototype-scale cap: enough to cover a typical small/independent local
// business site's marketing pages without a single audit crawling a huge
// site (e.g. a chain site with thousands of blog posts) for minutes on end.
const MAX_PAGES = 40;
const MAX_BFS_DEPTH = 3;
const DISCOVERY_CONCURRENCY = 8;

const SKIP_EXTENSIONS = /\.(jpe?g|png|gif|svg|webp|ico|css|js|pdf|zip|docx?|xlsx?|mp4|mp3|woff2?|ttf|eot|xml|json)$/i;
const SKIP_PATH_PATTERNS = /\/(wp-admin|wp-login|wp-json|cart|checkout|my-account|login|signup|search)(\/|$)/i;

const UA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

/**
 * Discovers every page reachable from the root URL before any content parsing
 * happens. Prefers Firecrawl's /v1/map (if configured), then sitemap.xml, and
 * falls back to a breadth-first crawl of on-page links.
 *
 * Discovery is scoped to the root URL's own path prefix, not the whole origin.
 * Many local businesses live on a shared group/franchise domain (e.g. a hotel
 * at fullertonhotels.com/fullerton-hotel-sydney, or a chain location under a
 * shared retailer domain) where the bare origin also hosts sibling locations
 * and a sitewide blog/editorial section. Scoping to the prefix keeps the audit
 * focused on the actual business instead of diluting it with unrelated pages.
 */
export async function discoverPages(rootUrl: string): Promise<string[]> {
  const origin = new URL(rootUrl).origin;
  const scopePrefix = getScopePrefix(rootUrl);

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (firecrawlKey && firecrawlKey.trim() !== '') {
    try {
      const urls = await mapWithFirecrawl(rootUrl, firecrawlKey);
      if (urls.length > 0) return dedupeInScope(urls, origin, scopePrefix).slice(0, MAX_PAGES);
    } catch (err) {
      console.warn('Firecrawl map failed, falling back to sitemap/link discovery:', err);
    }
  }

  const sitemapUrls = await readSitemap(origin);
  if (sitemapUrls.length > 0) {
    const scoped = dedupeInScope([rootUrl, ...sitemapUrls], origin, scopePrefix);
    if (scoped.length > 1) return scoped.slice(0, MAX_PAGES);
    // Sitemap existed but nothing else matched this property's prefix (e.g. a
    // sitemap that only lists top-level pages) — fall through to link crawling.
  }

  return crawlLinksBFS(rootUrl, origin, scopePrefix);
}

/** First path segment of the root URL, e.g. "/fullerton-hotel-sydney" or "/sydney". Empty if the root is the site's homepage. */
function getScopePrefix(rootUrl: string): string {
  const firstSegment = new URL(rootUrl).pathname.split('/').filter(Boolean)[0];
  return firstSegment ? `/${firstSegment}` : '';
}

function inScope(pathname: string, scopePrefix: string): boolean {
  if (!scopePrefix) return true; // root is the homepage itself: the whole origin is in scope
  return pathname === scopePrefix || pathname.startsWith(`${scopePrefix}/`);
}

async function mapWithFirecrawl(url: string, key: string): Promise<string[]> {
  const res = await fetch('https://api.firecrawl.dev/v1/map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ url, limit: MAX_PAGES }),
  });
  const data = await res.json();
  if (!data.success || !Array.isArray(data.links)) return [];
  return data.links.map((link: { url: string }) => link.url).filter(Boolean);
}

async function readSitemap(origin: string): Promise<string[]> {
  const xml = await fetchText(`${origin}/sitemap.xml`);
  if (!xml) return [];

  const $ = cheerio.load(xml, { xmlMode: true });

  // Sitemap index: fan out into the first few child sitemaps.
  const childSitemaps = $('sitemapindex > sitemap > loc')
    .map((_, el) => $(el).text().trim())
    .get();

  if (childSitemaps.length > 0) {
    const childXmls = await Promise.all(childSitemaps.slice(0, 5).map((loc) => fetchText(loc)));
    const urls: string[] = [];
    for (const childXml of childXmls) {
      if (!childXml) continue;
      const $$ = cheerio.load(childXml, { xmlMode: true });
      urls.push(...$$('urlset > url > loc').map((_, el) => $$(el).text().trim()).get());
    }
    return urls;
  }

  return $('urlset > url > loc').map((_, el) => $(el).text().trim()).get();
}

async function crawlLinksBFS(rootUrl: string, origin: string, scopePrefix: string): Promise<string[]> {
  const start = normalize(rootUrl);
  const visited = new Set<string>([start]);
  const discovered: string[] = [start];

  let frontier = [start];

  for (let depth = 0; depth < MAX_BFS_DEPTH && frontier.length > 0 && discovered.length < MAX_PAGES; depth++) {
    const nextFrontier: string[] = [];

    for (let i = 0; i < frontier.length && discovered.length < MAX_PAGES; i += DISCOVERY_CONCURRENCY) {
      const batch = frontier.slice(i, i + DISCOVERY_CONCURRENCY);
      const htmls = await Promise.all(batch.map((url) => fetchText(url)));

      batch.forEach((url, idx) => {
        const html = htmls[idx];
        if (!html) return;

        const $ = cheerio.load(html);
        $('a[href]').each((_, el) => {
          if (discovered.length >= MAX_PAGES) return;
          const href = $(el).attr('href');
          const resolved = href && resolveLink(href, url, origin, scopePrefix);
          if (resolved && !visited.has(resolved)) {
            visited.add(resolved);
            discovered.push(resolved);
            nextFrontier.push(resolved);
          }
        });
      });
    }

    frontier = nextFrontier;
  }

  return discovered;
}

function resolveLink(href: string, base: string, origin: string, scopePrefix: string): string | null {
  if (/^(mailto|tel|javascript):/i.test(href)) return null;
  try {
    const resolved = new URL(href, base);
    if (resolved.origin !== origin) return null;
    if (!inScope(resolved.pathname, scopePrefix)) return null;
    if (SKIP_EXTENSIONS.test(resolved.pathname)) return null;
    if (SKIP_PATH_PATTERNS.test(resolved.pathname)) return null;
    return normalize(resolved.toString());
  } catch {
    return null;
  }
}

/** Canonicalizes a URL (strips hash/query, trailing slash) so the same page is recognized consistently across discovery, scoping, and result caching. */
export function normalizeUrl(rawUrl: string): string {
  return normalize(rawUrl);
}

/**
 * Fetches searchPageUrl and returns same-origin, in-scope links whose href
 * path or visible text matches any of the given keywords. Used by the gap-
 * filling investigator agent to look for a specific missing page category
 * (e.g. "policies") without ever escaping the site's own path-prefix scope —
 * the same scoping discoverPages() uses, so the agent can't wander into
 * sibling properties or sitewide blog content either.
 */
export async function findLinksByKeywords(
  searchPageUrl: string,
  scopeRootUrl: string,
  keywords: string[]
): Promise<string[]> {
  const origin = new URL(scopeRootUrl).origin;
  const scopePrefix = getScopePrefix(scopeRootUrl);
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  const html = await fetchText(searchPageUrl);
  if (!html) return [];

  const $ = cheerio.load(html);
  const matches = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const linkText = $(el).text().toLowerCase();
    const matchesKeyword = lowerKeywords.some((k) => href.toLowerCase().includes(k) || linkText.includes(k));
    if (!matchesKeyword) return;
    const resolved = resolveLink(href, searchPageUrl, origin, scopePrefix);
    if (resolved) matches.add(resolved);
  });

  return Array.from(matches);
}

function normalize(rawUrl: string): string {
  const u = new URL(rawUrl);
  u.hash = '';
  u.search = ''; // avoid crawling query-string permutations (filters, sorting, tracking params) as distinct pages
  if (u.pathname !== '/' && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

function dedupeInScope(urls: string[], origin: string, scopePrefix: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    try {
      const u = new URL(raw);
      if (u.origin !== origin) continue;
      if (!inScope(u.pathname, scopePrefix)) continue;
      if (SKIP_EXTENSIONS.test(u.pathname)) continue;
      const norm = normalize(raw);
      if (!seen.has(norm)) {
        seen.add(norm);
        out.push(norm);
      }
    } catch {
      // Skip malformed entries rather than failing the whole discovery pass.
    }
  }
  return out;
}

async function fetchText(url: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: UA_HEADERS });
      if (res.ok) return await res.text();
      if (attempt === retries) return null;
    } catch {
      if (attempt === retries) return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  return null;
}
