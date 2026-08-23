import { crawlHotelPage, ExtractedPageData } from './crawler';
import { discoverPages, normalizeUrl } from './discovery';
import { investigateGaps } from './investigator';
import { analyzeHotelWebsite } from './analyzer';
import { resolveHotelWebsite } from './resolver';
import { prisma } from './prisma';
import { PIPELINE_VERSION } from './version';

const CRAWL_CONCURRENCY = 5;
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
  if (/room|suite|accommodat/.test(path)) return 'ROOMS';
  if (/amenit|facilit|wellness|spa|gym|pool/.test(path)) return 'AMENITIES';
  if (/dining|restaurant|bar|menu|food/.test(path)) return 'DINING';
  if (/location|direction|map|contact/.test(path)) return 'LOCATION';
  if (/polic|terms|faq|cancellation/.test(path)) return 'POLICIES';
  return 'GENERAL';
}

/**
 * Discovers subpages and executes a full AI visibility scan.
 */
export async function runAuditScan(rootQuery: string, options: { forceRefresh?: boolean } = {}) {
  const trimmedInput = rootQuery.trim();

  // Accept either a direct URL/domain, or a free-text hotel name/description —
  // the latter is resolved to the hotel's official site via search-grounded AI lookup.
  const resolvedUrl = isUrlLike(trimmedInput)
    ? trimmedInput.startsWith('http')
      ? trimmedInput
      : `https://${trimmedInput}`
    : await resolveHotelWebsite(trimmedInput);

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

  try {
    // 2. Discover every same-origin page/route first, then crawl each one
    const discoveredUrls = await discoverPages(targetUrl);

    if (discoveredUrls.length === 0) {
      throw new Error('Could not discover any pages on the target website.');
    }

    const crawledPages: ExtractedPageData[] = [];
    const pageTypes = new Map<string, string>();

    for (let i = 0; i < discoveredUrls.length; i += CRAWL_CONCURRENCY) {
      const batch = discoveredUrls.slice(i, i + CRAWL_CONCURRENCY);
      await Promise.all(
        batch.map(async (url) => {
          try {
            const pageData = await crawlHotelPage(url);
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
            }
          } catch (err) {
            // Continue if a specific page does not exist (404) or fails to crawl
            console.warn(`Page ${url} not found or failed to crawl:`, err);
          }
        })
      );
    }

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
    const analysisReport = await analyzeHotelWebsite(crawledPages, pageTypes);

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

    return { ...completedScan, fromCache: false };
  } catch (error) {
    await prisma.auditScan.update({
      where: { id: scan.id },
      data: { status: 'FAILED' },
    });
    throw error;
  }
}