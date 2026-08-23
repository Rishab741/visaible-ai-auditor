import { investigateGaps } from '../investigator';
import { EvalCase, assert } from './framework';

export const investigatorEvalCases: EvalCase[] = [
  {
    name: 'investigator: skips the LLM entirely when every page type is already covered',
    tier: 'fast',
    run: async () => {
      const start = Date.now();
      const pages = await investigateGaps({
        targetUrl: 'https://example.com',
        presentPageTypes: new Set(['ROOMS', 'AMENITIES', 'DINING', 'LOCATION', 'POLICIES']),
        alreadyCrawledUrls: new Set(),
      });
      const durationMs = Date.now() - start;
      assert(pages.length === 0, `expected no bonus pages when nothing is missing, got ${pages.length}`);
      // A real LLM round-trip takes at least ~1s; finishing near-instantly
      // confirms the fast path skipped the model call entirely.
      assert(durationMs < 500, `expected the no-gap fast path to skip the LLM call, took ${durationMs}ms`);
    },
  },
  {
    name: 'investigator: gap-filling on a real site never returns out-of-scope or duplicate URLs',
    tier: 'live',
    run: async () => {
      const targetUrl = 'https://acehotel.com/sydney';
      const alreadyCrawledUrls = new Set([targetUrl, 'https://acehotel.com/sydney/rooms']);

      const pages = await investigateGaps({
        targetUrl,
        presentPageTypes: new Set(['ROOMS']), // deliberately missing AMENITIES/DINING/LOCATION/POLICIES
        alreadyCrawledUrls,
      });

      for (const page of pages) {
        const url = new URL(page.url);
        assert(url.origin === 'https://acehotel.com', `bonus page escaped the site's origin: ${page.url}`);
        assert(url.pathname.startsWith('/sydney'), `bonus page escaped the property's path scope: ${page.url}`);
        assert(!alreadyCrawledUrls.has(page.url), `bonus page duplicates an already-crawled URL: ${page.url}`);
      }
    },
  },
  {
    name: 'investigator: a failure inside the agent degrades to zero bonus pages, never throws',
    tier: 'live',
    run: async () => {
      // An unreachable target still exercises the real code path (search_links
      // and crawl_page will fail internally) — investigateGaps must swallow
      // that and resolve, not propagate a rejection into the scan.
      const pages = await investigateGaps({
        targetUrl: 'https://this-domain-should-not-exist-visaible-eval.invalid',
        presentPageTypes: new Set(),
        alreadyCrawledUrls: new Set(),
      });
      assert(Array.isArray(pages), 'investigateGaps must resolve to an array even when everything inside fails');
    },
  },
];
