import { crawlBusinessPage, ExtractedPageData } from './crawler';
import { discoverPages, normalizeUrl } from './discovery';
import { investigateGaps } from './investigator';
import { analyzeBusinessWebsite } from './analyzer';
import { resolveBusinessWebsite } from './resolver';
import { prisma } from './prisma';
import { PIPELINE_VERSION } from './version';

// The real crawl-time budget (discovery can enumerate far more — see
// MAX_DISCOVERED_URLS in lib/discovery.ts — but each of these costs a real
// Firecrawl fetch, which is the dominant cost against Vercel's 60s Hobby-
// plan ceiling). Kept small deliberately; prioritizeForCrawl() below is what
// makes a small number here still land one representative page per expected
// category instead of just "whichever N happened to be discovered first".
const MAX_CRAWL_PAGES = 18;
const CRAWL_CONCURRENCY = 10;
// How long a completed scan stays valid as a cached result for the same target
// URL. Crawling and LLM analysis both introduce variance (live page content can
// change, and the model samples non-deterministically) — serving the same
// recent scan back out means the same search reliably shows the same output
// instead of drifting on every request.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isUrlLike(input: string): boolean {
  if (/\s/.test(input)) return false;
  if (/^https?:\/\//i.test(input)) return true;
  // Bare domain, e.g. "fullertonhotels.com" or "fullertonhotels.com/sydney"
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(input);
}

function classifyPageType(url: string, targetUrl: string): string {
  const path = new URL(url).pathname.toLowerCase();
  if (url === targetUrl || path === '/' || path === '') return 'HOMEPAGE';
  if (/room|suite|accommodat|menu|eat|drink|food|product|service|shop|store|pricing|book|reserv|amenit|facilit|wellness|spa|gym|pool|dining|restaurant|bar/.test(path)) return 'OFFERINGS';
  if (/about|our-story|who-we-are|team|history/.test(path)) return 'ABOUT';
  // Contact info is folded into LOCATION rather than treated as its own
  // required category — most local business sites put contact details on a
  // location/visit-us page (or the homepage/footer) instead of a dedicated
  // /contact URL, and requiring one made PAGE_COVERAGE gaps (and the
  // gap-filling agent they trigger) fire on nearly every real site.
  if (/location|direction|map|visit|hours|contact|reach|enquir|find-us|near|explore|discover|around|neighbo/.test(path)) return 'LOCATION';
  // "faq" alone misses sites that spell it out (Ace Hotel Sydney's own
  // /frequently-asked-questions page, confirmed live: it fell through to
  // GENERAL, which read as "no policies page" and triggered the gap-filling
  // agent for a page that had already been crawled and was sitting right
  // there, just misclassified).
  if (/polic|terms|faq|frequently-asked|cancellation|privacy|returns/.test(path)) return 'POLICIES';
  return 'GENERAL';
}

// EXPECTED_PAGE_TYPES duplicated from lib/signals.ts (not imported) — this
// runs before any crawling happens, purely to pick which discovered URLs are
// worth spending a crawl on, and shouldn't need to reach into the scoring
// module to do it.
const REQUIRED_CATEGORIES = ['OFFERINGS', 'ABOUT', 'LOCATION', 'POLICIES'];

/**
 * Cuts a (possibly large) discovered URL list down to the real crawl budget
 * — but unlike a plain slice, it spends that budget deliberately: the
 * homepage, then one URL per required category (in whatever order they
 * first appear), then whatever's left, in original discovery order.
 *
 * This exists because a plain slice(0, MAX_CRAWL_PAGES) on a large site can
 * easily miss a site's one policies or location page entirely if it happens
 * to sit past the cutoff in Firecrawl's /v1/map or sitemap order — which
 * then falsely reads as "no policies page exists" and spends 20-40s
 * dispatching the gap-filling investigator agent to go looking for one that
 * was there all along.
 */
export function prioritizeForCrawl(discoveredUrls: string[], targetUrl: string, budget: number): string[] {
  const classified = discoveredUrls.map((url) => ({ url, type: classifyPageType(url, targetUrl) }));

  const picked: string[] = [];
  const pickedUrls = new Set<string>();
  const take = (url: string) => {
    if (pickedUrls.has(url) || picked.length >= budget) return;
    pickedUrls.add(url);
    picked.push(url);
  };

  const homepage = classified.find((c) => c.type === 'HOMEPAGE');
  if (homepage) take(homepage.url);

  for (const category of REQUIRED_CATEGORIES) {
    const match = classified.find((c) => c.type === category && !pickedUrls.has(c.url));
    if (match) take(match.url);
  }

  for (const { url } of classified) {
    if (picked.length >= budget) break;
    take(url);
  }

  return picked;
}

/**
 * Discovers subpages and executes a full AI visibility scan.
 */
export async function runAuditScan(rootQuery: string, options: { forceRefresh?: boolean } = {}) {
  const trimmedInput = rootQuery.trim();
  const t0 = Date.now();
  // Phase-by-phase timing, deliberately logged rather than inferred after
  // the fact — a Vercel Runtime Timeout kills the process with no stack
  // trace and no chance for our own code to report what it was doing, so
  // the only way to know which phase actually ate the 60s on a given run is
  // to have already been printing it as we went. Every log line is
  // grep-able by "[audit]" and, once the scan record exists, by its id.
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  // Accept either a direct URL/domain, or a free-text business name/description —
  // the latter is resolved to the business's official site via search-grounded AI lookup.
  const resolvedUrl = isUrlLike(trimmedInput)
    ? trimmedInput.startsWith('http')
      ? trimmedInput
      : `https://${trimmedInput}`
    : await resolveBusinessWebsite(trimmedInput);
  console.log(`[audit] resolve done at ${elapsed()} -> ${resolvedUrl}`);

  // Canonicalize so different phrasings of the same search ("Ace Hotel Sydney"
  // vs. the resolved URL with/without a trailing slash) converge on one cache key.
  const targetUrl = normalizeUrl(resolvedUrl);

  if (!options.forceRefresh) {
    const cachedScan = await prisma.auditScan.findFirst({
      where: {
        targetUrl,
        status: 'COMPLETED',
        pipelineVersion: PIPELINE_VERSION, // scans from older scoring logic never match, so they age out automatically
        updatedAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
      },
      orderBy: { updatedAt: 'desc' },
      include: { pages: true, suggestions: true },
    });
    if (cachedScan) {
      console.log(`[audit] cache hit at ${elapsed()} for ${targetUrl} -- no pipeline work done`);
      return { ...cachedScan, fromCache: true };
    }
  }

  // 1. Create Initial Scan Record in SQLite
  const scan = await prisma.auditScan.create({
    data: {
      targetUrl,
      status: 'CRAWLING',
      pipelineVersion: PIPELINE_VERSION,
    },
  });
  console.log(`[audit ${scan.id}] cache miss, starting fresh pipeline for ${targetUrl} at ${elapsed()}`);

  try {
    // 2. Discover every same-origin page/route first, then pick which of
    // them are actually worth spending a crawl on (see prioritizeForCrawl —
    // this is what keeps a large site's real policies/location page from
    // getting truncated away just because of where it landed in discovery
    // order).
    const discoveredUrls = await discoverPages(targetUrl);
    console.log(`[audit ${scan.id}] discovery done at ${elapsed()} -- found ${discoveredUrls.length} URLs`);

    if (discoveredUrls.length === 0) {
      throw new Error('Could not discover any pages on the target website.');
    }

    const urlsToCrawl = prioritizeForCrawl(discoveredUrls, targetUrl, MAX_CRAWL_PAGES);
    console.log(`[audit ${scan.id}] crawl budget: attempting ${urlsToCrawl.length} of ${discoveredUrls.length} discovered URLs`);

    const crawledPages: ExtractedPageData[] = [];
    const pageTypes = new Map<string, string>();
    let crawlFailures = 0;
    let thinContentDrops = 0;

    for (let i = 0; i < urlsToCrawl.length; i += CRAWL_CONCURRENCY) {
      const batch = urlsToCrawl.slice(i, i + CRAWL_CONCURRENCY);
      await Promise.all(
        batch.map(async (url) => {
          try {
            const pageData = await crawlBusinessPage(url);
            if (pageData.markdown && pageData.markdown.length > 50) {
              crawledPages.push(pageData);
              const pageType = classifyPageType(url, targetUrl);
              pageTypes.set(pageData.url, pageType);

              // Save page to DB
              await prisma.scannedPage.create({
                data: {
                  auditScanId: scan.id,
                  url: pageData.url,
                  pageType,
                  title: pageData.title,
                  markdownContent: pageData.markdown,
                  rawJsonLd: JSON.stringify(pageData.schemaJsonLd),
                },
              });
            } else {
              // Crawled without throwing, but too thin to be useful (e.g. a
              // JS-rendered page Firecrawl couldn't extract, or a redirect
              // to an empty page) — previously silent: no log, no count,
              // just vanished from the final page total with no trace.
              thinContentDrops++;
              console.warn(`[audit ${scan.id}] page crawled but too thin to use (${url}, ${pageData.markdown?.length ?? 0} chars) at ${elapsed()}`);
            }
          } catch (err) {
            // Continue if a specific page does not exist (404) or fails to crawl
            crawlFailures++;
            console.warn(`[audit ${scan.id}] page failed to crawl (${url}) at ${elapsed()}:`, err);
          }
        })
      );
      console.log(`[audit ${scan.id}] crawl batch ${Math.floor(i / CRAWL_CONCURRENCY) + 1}/${Math.ceil(urlsToCrawl.length / CRAWL_CONCURRENCY)} done at ${elapsed()}`);
    }
    console.log(
      `[audit ${scan.id}] crawl phase done at ${elapsed()} -- ${crawledPages.length} of ${urlsToCrawl.length} attempted pages usable (${crawlFailures} failed, ${thinContentDrops} too thin), present categories: ${Array.from(new Set(pageTypes.values())).join(', ')}`
    );

    if (crawledPages.length === 0) {
      throw new Error('Could not crawl any accessible pages from the target URL.');
    }

    // 2b. Gap-filling investigator agent: only runs (and only spends an LLM
    // call) if static discovery missed an expected page category entirely.
    // Strictly additive — never removes or replaces anything already crawled.
    const bonusPages = await investigateGaps({
      targetUrl,
      presentPageTypes: new Set(pageTypes.values()),
      alreadyCrawledUrls: new Set(crawledPages.map((p) => p.url)),
    });
    console.log(`[audit ${scan.id}] gap-filling investigator done at ${elapsed()} -- ${bonusPages.length} bonus pages`);

    for (const pageData of bonusPages) {
      crawledPages.push(pageData);
      const pageType = classifyPageType(pageData.url, targetUrl);
      pageTypes.set(pageData.url, pageType);

      await prisma.scannedPage.create({
        data: {
          auditScanId: scan.id,
          url: pageData.url,
          pageType,
          title: pageData.title,
          markdownContent: pageData.markdown,
          rawJsonLd: JSON.stringify(pageData.schemaJsonLd),
        },
      });
    }

    // 3. Update status to ANALYZING
    await prisma.auditScan.update({
      where: { id: scan.id },
      data: { status: 'ANALYZING' },
    });

    // 4. Run Multi-Pass AI Analysis (category/overall scores are computed
    // deterministically from the crawl — see lib/signals.ts)
    const analysisReport = await analyzeBusinessWebsite(crawledPages, pageTypes);
    console.log(`[audit ${scan.id}] LLM analysis done at ${elapsed()} -- ${analysisReport.suggestions.length} suggestions`);

    // Persisted so the on-demand implementation-snippet agent (lib/snippetAgent.ts)
    // can format output for this site's CMS later without re-crawling.
    const detectedCms = crawledPages.some((p) => p.cms === 'wordpress') ? 'wordpress' : 'unknown';

    // 5. Store Suggestions in DB
    for (const item of analysisReport.suggestions) {
      await prisma.optimizationSuggestion.create({
        data: {
          auditScanId: scan.id,
          category: item.category,
          severity: item.severity,
          issue: item.issue,
          impactReason: item.impactReason,
          suggestedFix: item.suggestedFix,
          affectedUrls: JSON.stringify(item.affectedUrls),
          currentSnippet: item.currentSnippet || null,
          confidenceScore: item.confidenceScore,
        },
      });
    }

    // 6. Complete Scan
    const completedScan = await prisma.auditScan.update({
      where: { id: scan.id },
      data: {
        hotelName: analysisReport.hotelName,
        summary: analysisReport.summary,
        overallScore: analysisReport.overallAiReadabilityScore,
        categoryScores: analysisReport.categoryScores,
        detectedCms,
        status: 'COMPLETED',
      },
      include: {
        pages: true,
        suggestions: true,
      },
    });

    console.log(`[audit ${scan.id}] COMPLETED at ${elapsed()}`);
    return { ...completedScan, fromCache: false };
  } catch (error) {
    console.error(`[audit ${scan.id}] FAILED at ${elapsed()}:`, error);
    await prisma.auditScan.update({
      where: { id: scan.id },
      data: { status: 'FAILED' },
    });
    throw error;
  }
}