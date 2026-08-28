import { Prisma } from '@/app/generated/prisma/client';
import { crawlBusinessPage, ExtractedPageData, PageStructuralSignals } from './crawler';
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
// Equal to MAX_CRAWL_PAGES so a full crawl batch runs as one parallel round
// instead of two sequential ones. Confirmed live: 18 pages at concurrency 10
// (two rounds of up to 10) took 43s just to crawl -- each round bounded by
// its own slowest page, so two rounds roughly doubles that cost. One round
// is bounded by only the single slowest page in the whole batch, now capped
// at FETCH_TIMEOUT_MS (lib/crawler.ts) regardless. Doesn't change how many
// pages get crawled, just how many rounds it takes to crawl them.
const CRAWL_CONCURRENCY = MAX_CRAWL_PAGES;
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

// How many URLs one CRAWLING step attempts before returning control to the
// caller. Bounded worst-case per chunk is ~2x FETCH_TIMEOUT_MS (two retry
// attempts on one slow page under fetchWithRetry) with real margin under
// Vercel's 60s ceiling -- at the cost of needing multiple /step round trips
// to get through a full MAX_CRAWL_PAGES budget. That's the whole point: many
// short invocations instead of one long one, with the same total page count.
const CRAWL_CHUNK_SIZE = 6;
// A claim lock older than this is assumed to belong to an invocation that
// got hard-killed mid-step (the same failure mode that used to strand scans
// forever) rather than one still legitimately running -- safe to steal.
// Must stay comfortably above any single invocation's real duration.
const STALE_LOCK_MS = 90_000;
// If a scan hasn't been touched at all in this long, no client is polling it
// and no invocation is working it -- reap it as failed rather than let it
// sit in a non-terminal status forever waiting for a poll that isn't coming.
const ABANDONED_MS = 10 * 60 * 1000;

const EMPTY_STRUCTURAL_SIGNALS: PageStructuralSignals = {
  h1Count: 0,
  headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
  listCount: 0,
  tableCount: 0,
  paragraphCount: 0,
  wordCount: 0,
  longestBlockWords: 0,
};

/** What's left to crawl on the next chunk: crawlUrls minus whatever's already landed as a ScannedPage row. Pure and re-derived fresh every step rather than mutated in place, so it stays correct no matter how many chunks a scan has already been through. */
export function deriveRemainingCrawlUrls(crawlUrls: string[], alreadyCrawledUrls: string[]): string[] {
  const crawled = new Set(alreadyCrawledUrls);
  return crawlUrls.filter((url) => !crawled.has(url));
}

/**
 * Mirrors the staleness threshold enforced atomically by stepAuditScan's
 * real compare-and-swap `updateMany` WHERE clause (see below) -- exists so
 * that threshold math is independently unit-testable without a DB. The
 * actual concurrency guarantee still comes from the literal Prisma query
 * being one atomic row-locked UPDATE, not from this function; this only
 * documents/verifies the same boundary it applies.
 */
export function isLockClaimable(processingSince: Date | null, now: Date = new Date()): boolean {
  return processingSince === null || processingSince.getTime() < now.getTime() - STALE_LOCK_MS;
}

type AuditScanRow = NonNullable<Awaited<ReturnType<typeof prisma.auditScan.findUnique>>>;
type ScannedPageRow = Awaited<ReturnType<typeof prisma.scannedPage.findMany>>[number];

/** Rebuilds an ExtractedPageData from a persisted ScannedPage row so the ANALYZING step can run against durable state instead of needing the crawl held in memory across separate invocations. `cms` is a stub -- detectedCms is aggregated incrementally during CRAWLING instead (see stepCrawl), so nothing downstream reads this field. */
function reconstructPageData(row: ScannedPageRow): ExtractedPageData {
  return {
    url: row.url,
    title: row.title ?? row.url,
    markdown: row.markdownContent,
    schemaJsonLd: row.rawJsonLd ? JSON.parse(row.rawJsonLd) : [],
    signals: (row.structuralSignals as unknown as PageStructuralSignals | null) ?? EMPTY_STRUCTURAL_SIGNALS,
    cms: 'unknown',
  };
}

/**
 * Fast half of the pipeline: resolve -> cache-check -> discover -> decide the
 * crawl budget. No full-page fetches happen here, so this comfortably fits
 * in a short-lived invocation. Mirrors the first half of the old
 * runAuditScan exactly (same cache-key semantics, same prioritizeForCrawl
 * call) -- only the "then go crawl everything inline" tail is different.
 */
export async function startAuditScan(rootQuery: string, options: { forceRefresh?: boolean } = {}) {
  const trimmedInput = rootQuery.trim();

  const resolvedUrl = isUrlLike(trimmedInput)
    ? trimmedInput.startsWith('http')
      ? trimmedInput
      : `https://${trimmedInput}`
    : await resolveBusinessWebsite(trimmedInput);

  const targetUrl = normalizeUrl(resolvedUrl);

  if (!options.forceRefresh) {
    const cachedScan = await prisma.auditScan.findFirst({
      where: {
        targetUrl,
        status: 'COMPLETED',
        pipelineVersion: PIPELINE_VERSION,
        updatedAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
      },
      orderBy: { updatedAt: 'desc' },
      include: { pages: true, suggestions: true },
    });
    if (cachedScan) {
      console.log(`[audit] cache hit for ${targetUrl} -- no pipeline work done`);
      return { fromCache: true as const, scan: cachedScan };
    }
  }

  const discoveredUrls = await discoverPages(targetUrl);
  if (discoveredUrls.length === 0) {
    throw new Error('Could not discover any pages on the target website.');
  }

  const urlsToCrawl = prioritizeForCrawl(discoveredUrls, targetUrl, MAX_CRAWL_PAGES);

  const scan = await prisma.auditScan.create({
    data: {
      targetUrl,
      status: 'CRAWLING',
      pipelineVersion: PIPELINE_VERSION,
      crawlUrls: urlsToCrawl,
    },
  });
  console.log(`[audit ${scan.id}] started for ${targetUrl} -- ${urlsToCrawl.length} of ${discoveredUrls.length} discovered URLs queued`);

  return { fromCache: false as const, id: scan.id };
}

// Non-terminal statuses a scan can be reaped out of. Listed explicitly
// (rather than "not COMPLETED/FAILED") so a typo'd future status string
// fails loudly instead of silently becoming reapable.
const NON_TERMINAL_STATUSES = ['PENDING', 'CRAWLING', 'INVESTIGATING', 'ANALYZING'];

/**
 * Flips one scan to FAILED if it's stuck in a non-terminal status with no
 * activity for ABANDONED_MS -- covers both "the client gave up polling" and
 * "every invocation that ever touched this scan got hard-killed before its
 * own catch block could run." A single conditional updateMany, so it's safe
 * to call redundantly (a scan that isn't actually stale is a no-op) and
 * atomic against a concurrent stepAuditScan call racing to claim the same
 * scan. Called both from stepAuditScan itself (so a poll on a dead scan
 * resolves it instead of looping forever) and from every read path that
 * shows non-terminal scans to a user, so a scan nobody's actively polling
 * still reaches a legible terminal state the next time anyone looks at it.
 */
export async function reapIfStale(scanId: string): Promise<boolean> {
  const result = await prisma.auditScan.updateMany({
    where: {
      id: scanId,
      status: { in: NON_TERMINAL_STATUSES },
      updatedAt: { lt: new Date(Date.now() - ABANDONED_MS) },
    },
    data: { status: 'FAILED', failureReason: 'abandoned: no progress', processingSince: null },
  });
  return result.count === 1;
}

/** Batch form of reapIfStale for list views (dashboard, recent-scans) -- one query instead of one per row. Returns how many were reaped. */
export async function reapAllStaleScans(): Promise<number> {
  const result = await prisma.auditScan.updateMany({
    where: {
      status: { in: NON_TERMINAL_STATUSES },
      updatedAt: { lt: new Date(Date.now() - ABANDONED_MS) },
    },
    data: { status: 'FAILED', failureReason: 'abandoned: no progress', processingSince: null },
  });
  return result.count;
}

export interface StepResult {
  id: string;
  status: string;
  done: boolean;
  /** Another invocation currently holds the claim lock -- transient, poll again, not an error. */
  locked?: boolean;
  /** Only meaningful while status is CRAWLING. */
  progress?: { crawled: number; total: number };
  error?: string;
}

/**
 * Advances a scan by exactly one bounded unit of work (one crawl chunk, or
 * one full INVESTIGATING/ANALYZING pass) and returns. Callers loop this
 * until `done`. Every non-terminal call is guarded by a compare-and-swap
 * claim on `processingSince` so a duplicate/overlapping call is a harmless
 * no-op (`locked: true`) rather than doing the same work twice, and any
 * invocation that itself gets hard-killed mid-step leaves a lock that
 * expires after STALE_LOCK_MS instead of stranding the scan forever -- the
 * next poll (client retry, or the staleness reap below) picks it back up
 * from whatever's already durable in the DB.
 */
export async function stepAuditScan(scanId: string): Promise<StepResult> {
  const scan = await prisma.auditScan.findUnique({ where: { id: scanId } });
  if (!scan) throw new Error(`Scan not found: ${scanId}`);

  if (scan.status === 'COMPLETED' || scan.status === 'FAILED') {
    return { id: scan.id, status: scan.status, done: true };
  }

  if (await reapIfStale(scan.id)) {
    console.warn(`[audit ${scan.id}] abandoned -- no progress for over ${ABANDONED_MS / 1000}s`);
    return { id: scan.id, status: 'FAILED', done: true, error: 'abandoned: no progress' };
  }

  const claim = await prisma.auditScan.updateMany({
    where: {
      id: scan.id,
      OR: [{ processingSince: null }, { processingSince: { lt: new Date(Date.now() - STALE_LOCK_MS) } }],
    },
    data: { processingSince: new Date() },
  });
  if (claim.count !== 1) {
    return { id: scan.id, status: scan.status, done: false, locked: true };
  }

  try {
    switch (scan.status) {
      case 'CRAWLING':
        return await stepCrawl(scan);
      case 'INVESTIGATING':
        return await stepInvestigate(scan);
      case 'ANALYZING':
        return await stepAnalyze(scan);
      default:
        throw new Error(`Unexpected scan status: ${scan.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[audit ${scan.id}] FAILED during ${scan.status}:`, error);
    await prisma.auditScan.update({
      where: { id: scan.id },
      data: { status: 'FAILED', failureReason: message, processingSince: null },
    });
    return { id: scan.id, status: 'FAILED', done: true, error: message };
  }
}

async function stepCrawl(scan: AuditScanRow): Promise<StepResult> {
  const crawlUrls = (scan.crawlUrls as string[] | null) ?? [];
  const crawledRows = await prisma.scannedPage.findMany({ where: { auditScanId: scan.id }, select: { url: true } });
  const alreadyCrawled = new Set(crawledRows.map((p) => p.url));
  const remaining = deriveRemainingCrawlUrls(crawlUrls, crawledRows.map((p) => p.url));

  if (remaining.length === 0) {
    await prisma.auditScan.update({
      where: { id: scan.id },
      data: { status: 'INVESTIGATING', processingSince: null },
    });
    console.log(`[audit ${scan.id}] crawl phase done -- ${alreadyCrawled.size} pages crawled, moving to INVESTIGATING`);
    return { id: scan.id, status: 'INVESTIGATING', done: false, progress: { crawled: alreadyCrawled.size, total: crawlUrls.length } };
  }

  const chunk = remaining.slice(0, CRAWL_CHUNK_SIZE);
  let wordpressSeen = false;

  await Promise.all(
    chunk.map(async (url) => {
      try {
        const pageData = await crawlBusinessPage(url);
        if (pageData.cms === 'wordpress') wordpressSeen = true;
        if (pageData.markdown && pageData.markdown.length > 50) {
          const pageType = classifyPageType(url, scan.targetUrl);
          await prisma.scannedPage.create({
            data: {
              auditScanId: scan.id,
              url: pageData.url,
              pageType,
              title: pageData.title,
              markdownContent: pageData.markdown,
              rawJsonLd: JSON.stringify(pageData.schemaJsonLd),
              structuralSignals: pageData.signals as unknown as Prisma.InputJsonValue,
            },
          });
        } else {
          console.warn(`[audit ${scan.id}] page crawled but too thin to use (${url}, ${pageData.markdown?.length ?? 0} chars)`);
        }
      } catch (err) {
        console.warn(`[audit ${scan.id}] page failed to crawl (${url}):`, err);
      }
    })
  );

  await prisma.auditScan.update({
    where: { id: scan.id },
    data: { processingSince: null, ...(wordpressSeen ? { detectedCms: 'wordpress' } : {}) },
  });

  const attemptedSoFar = alreadyCrawled.size + chunk.length;
  console.log(`[audit ${scan.id}] crawl chunk done -- attempted ${chunk.length}, ${remaining.length - chunk.length} remaining`);
  return {
    id: scan.id,
    status: 'CRAWLING',
    done: false,
    progress: { crawled: Math.min(attemptedSoFar, crawlUrls.length), total: crawlUrls.length },
  };
}

async function stepInvestigate(scan: AuditScanRow): Promise<StepResult> {
  const pages = await prisma.scannedPage.findMany({ where: { auditScanId: scan.id } });
  const presentPageTypes = new Set(pages.map((p) => p.pageType));
  const alreadyCrawledUrls = new Set(pages.map((p) => p.url));

  const bonusPages = await investigateGaps({ targetUrl: scan.targetUrl, presentPageTypes, alreadyCrawledUrls });
  console.log(`[audit ${scan.id}] gap-filling investigator done -- ${bonusPages.length} bonus pages`);

  let wordpressSeen = false;
  for (const pageData of bonusPages) {
    if (pageData.cms === 'wordpress') wordpressSeen = true;
    const pageType = classifyPageType(pageData.url, scan.targetUrl);
    await prisma.scannedPage.create({
      data: {
        auditScanId: scan.id,
        url: pageData.url,
        pageType,
        title: pageData.title,
        markdownContent: pageData.markdown,
        rawJsonLd: JSON.stringify(pageData.schemaJsonLd),
        structuralSignals: pageData.signals as unknown as Prisma.InputJsonValue,
      },
    });
  }

  await prisma.auditScan.update({
    where: { id: scan.id },
    data: { status: 'ANALYZING', processingSince: null, ...(wordpressSeen ? { detectedCms: 'wordpress' } : {}) },
  });

  return { id: scan.id, status: 'ANALYZING', done: false };
}

async function stepAnalyze(scan: AuditScanRow): Promise<StepResult> {
  const rows = await prisma.scannedPage.findMany({ where: { auditScanId: scan.id } });
  if (rows.length === 0) {
    throw new Error('Could not crawl any accessible pages from the target URL.');
  }

  const pages = rows.map(reconstructPageData);
  const pageTypes = new Map(rows.map((r) => [r.url, r.pageType]));

  const analysisReport = await analyzeBusinessWebsite(pages, pageTypes);
  console.log(`[audit ${scan.id}] LLM analysis done -- ${analysisReport.suggestions.length} suggestions`);

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

  await prisma.auditScan.update({
    where: { id: scan.id },
    data: {
      hotelName: analysisReport.hotelName,
      summary: analysisReport.summary,
      overallScore: analysisReport.overallAiReadabilityScore,
      categoryScores: analysisReport.categoryScores,
      status: 'COMPLETED',
      processingSince: null,
    },
  });

  console.log(`[audit ${scan.id}] COMPLETED`);
  return { id: scan.id, status: 'COMPLETED', done: true };
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