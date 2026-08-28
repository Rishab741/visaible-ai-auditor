import { crawlBusinessPage } from '../crawler';
import { prioritizeForCrawl, deriveRemainingCrawlUrls, isLockClaimable } from '../pipeline';
import { computeSiteSignals } from '../signals';
import { analyzeBusinessWebsite } from '../analyzer';
import { EvalCase, assert, assertInRange } from './framework';

const TEST_PAGES: Array<{ url: string; type: string }> = [
  { url: 'https://acehotel.com/sydney', type: 'HOMEPAGE' },
  { url: 'https://acehotel.com/sydney/rooms', type: 'OFFERINGS' },
  { url: 'https://acehotel.com/sydney/eat-drink', type: 'OFFERINGS' },
];

export const pipelineEvalCases: EvalCase[] = [
  {
    // Regression: a plain slice(0, budget) on discovery order could drop a
    // site's one policies (or offerings/about/location) page entirely if it
    // happened to sit past the cutoff — which then falsely read as "missing"
    // and triggered the gap-filling investigator agent, adding real latency
    // to every affected audit. This is what surfaced as production 504s on
    // larger sites even after the crawl budget itself was already tightened.
    name: 'pipeline: prioritizeForCrawl keeps a late-discovered category page inside a tight budget',
    tier: 'fast',
    run: () => {
      const targetUrl = 'https://example.com/';
      // Simulates a real site: homepage first, then a long run of offering
      // pages (as Firecrawl's /v1/map or a sitemap might order them), with
      // the site's only policies page discovered dead last.
      const discovered = [
        targetUrl,
        'https://example.com/rooms/deluxe',
        'https://example.com/rooms/suite',
        'https://example.com/dining/restaurant',
        'https://example.com/dining/bar',
        'https://example.com/amenities/spa',
        'https://example.com/amenities/gym',
        'https://example.com/about/history',
        'https://example.com/location/directions',
        'https://example.com/terms-and-conditions', // POLICIES — last, and outside a naive slice(0, 5)
      ];

      const picked = prioritizeForCrawl(discovered, targetUrl, 5);

      assert(picked.length === 5, `expected exactly 5 URLs within budget, got ${picked.length}`);
      assert(picked.includes(targetUrl), 'homepage must always be included');
      assert(
        picked.includes('https://example.com/terms-and-conditions'),
        `expected the late-discovered policies page to be prioritized into the budget, got: ${JSON.stringify(picked)}`
      );
    },
  },
  {
    // The resumable step machine derives "what's left to crawl" fresh every
    // /step call instead of tracking an in-memory cursor (there is no memory
    // across separate invocations) -- this is the one piece of state every
    // CRAWLING step depends on getting right.
    name: 'pipeline: deriveRemainingCrawlUrls correctly excludes already-crawled URLs across repeated calls',
    tier: 'fast',
    run: () => {
      const crawlUrls = ['https://example.com/', 'https://example.com/rooms', 'https://example.com/about', 'https://example.com/terms'];

      const firstChunk = deriveRemainingCrawlUrls(crawlUrls, []);
      assert(
        JSON.stringify(firstChunk) === JSON.stringify(crawlUrls),
        `expected all URLs remaining on the first call, got ${JSON.stringify(firstChunk)}`
      );

      const afterOneChunk = deriveRemainingCrawlUrls(crawlUrls, ['https://example.com/', 'https://example.com/rooms']);
      assert(
        JSON.stringify(afterOneChunk) === JSON.stringify(['https://example.com/about', 'https://example.com/terms']),
        `expected only uncralwed URLs to remain, got ${JSON.stringify(afterOneChunk)}`
      );

      const afterAllCrawled = deriveRemainingCrawlUrls(crawlUrls, crawlUrls);
      assert(afterAllCrawled.length === 0, `expected nothing remaining once every URL is crawled, got ${JSON.stringify(afterAllCrawled)}`);
    },
  },
  {
    // stepAuditScan's real concurrency safety comes from an atomic Prisma
    // updateMany WHERE clause (a DB round trip, out of scope for the fast
    // tier) -- this verifies the staleness-threshold math that clause
    // enforces: a fresh lock blocks a second claim, but a lock left behind by
    // a hard-killed invocation eventually becomes stealable again.
    name: 'pipeline: isLockClaimable blocks a fresh lock but allows stealing a stale one',
    tier: 'fast',
    run: () => {
      const now = new Date('2026-01-01T00:00:00Z');

      assert(isLockClaimable(null, now), 'a scan with no lock held must be claimable');

      const justClaimed = new Date(now.getTime() - 1_000); // held 1s ago
      assert(!isLockClaimable(justClaimed, now), 'a lock claimed moments ago must block a second concurrent claim');

      const staleClaim = new Date(now.getTime() - 91_000); // held 91s ago, past STALE_LOCK_MS (90s)
      assert(isLockClaimable(staleClaim, now), 'a lock left behind by a hard-killed invocation must become stealable once stale');
    },
  },
  {
    name: 'pipeline: analyzeBusinessWebsite score exactly matches independent computeSiteSignals recomputation',
    tier: 'live',
    run: async () => {
      const pages = await Promise.all(TEST_PAGES.map((p) => crawlBusinessPage(p.url)));
      const pageTypes = new Map(TEST_PAGES.map((p) => [p.url, p.type]));

      const expected = computeSiteSignals(pages, pageTypes);
      const report = await analyzeBusinessWebsite(pages, pageTypes);

      assert(
        report.overallAiReadabilityScore === expected.overallScore,
        `analyzer overallScore ${report.overallAiReadabilityScore} !== recomputed ${expected.overallScore}`
      );
      assert(
        JSON.stringify(report.categoryScores) === JSON.stringify(expected.categoryScores),
        `analyzer categoryScores ${JSON.stringify(report.categoryScores)} !== recomputed ${JSON.stringify(expected.categoryScores)}`
      );

      assertInRange(report.overallAiReadabilityScore, 0, 100, 'overallAiReadabilityScore');
      assert(report.hotelName.length > 0, 'business name (hotelName) must not be empty');
      assert(report.summary.length > 0, 'summary must not be empty');

      const hardFindingSuggestions = report.suggestions.filter((s) => s.confidenceScore === 1);
      assert(
        hardFindingSuggestions.length === expected.hardFindings.length,
        `expected ${expected.hardFindings.length} hard-finding-derived suggestions, got ${hardFindingSuggestions.length}`
      );

      for (const s of report.suggestions) {
        assert(s.issue.trim().length > 0, 'every suggestion must have non-empty issue text');
        assert(s.impactReason.trim().length > 0, 'every suggestion must have non-empty impactReason text');
        assert(s.suggestedFix.trim().length > 0, 'every suggestion must have non-empty suggestedFix text');
        assert(s.affectedUrls.length > 0, 'every suggestion must reference at least one affected URL');
        assertInRange(s.confidenceScore, 0, 1, 'suggestion.confidenceScore');
      }
    },
  },
  {
    name: 'pipeline: a site with zero crawlable content fails loudly, not silently',
    tier: 'live',
    run: async () => {
      try {
        await crawlBusinessPage('https://this-domain-should-not-exist-visaible-eval.invalid');
        throw new Error('expected crawlBusinessPage to throw for an unresolvable domain');
      } catch (err) {
        assert(err instanceof Error, 'expected an Error to be thrown for an unreachable domain');
      }
    },
  },
];
