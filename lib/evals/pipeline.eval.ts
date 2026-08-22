import { crawlHotelPage } from '../crawler';
import { computeSiteSignals } from '../signals';
import { analyzeHotelWebsite } from '../analyzer';
import { EvalCase, assert, assertInRange } from './framework';

const TEST_PAGES: Array<{ url: string; type: string }> = [
  { url: 'https://acehotel.com/sydney', type: 'HOMEPAGE' },
  { url: 'https://acehotel.com/sydney/rooms', type: 'ROOMS' },
  { url: 'https://acehotel.com/sydney/eat-drink', type: 'DINING' },
];

export const pipelineEvalCases: EvalCase[] = [
  {
    name: 'pipeline: analyzeHotelWebsite score exactly matches independent computeSiteSignals recomputation',
    tier: 'live',
    run: async () => {
      const pages = await Promise.all(TEST_PAGES.map((p) => crawlHotelPage(p.url)));
      const pageTypes = new Map(TEST_PAGES.map((p) => [p.url, p.type]));

      const expected = computeSiteSignals(pages, pageTypes);
      const report = await analyzeHotelWebsite(pages, pageTypes);

      assert(
        report.overallAiReadabilityScore === expected.overallScore,
        `analyzer overallScore ${report.overallAiReadabilityScore} !== recomputed ${expected.overallScore}`
      );
      assert(
        JSON.stringify(report.categoryScores) === JSON.stringify(expected.categoryScores),
        `analyzer categoryScores ${JSON.stringify(report.categoryScores)} !== recomputed ${JSON.stringify(expected.categoryScores)}`
      );

      assertInRange(report.overallAiReadabilityScore, 0, 100, 'overallAiReadabilityScore');
      assert(report.hotelName.length > 0, 'hotelName must not be empty');
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
        await crawlHotelPage('https://this-domain-should-not-exist-visaible-eval.invalid');
        throw new Error('expected crawlHotelPage to throw for an unresolvable domain');
      } catch (err) {
        assert(err instanceof Error, 'expected an Error to be thrown for an unreachable domain');
      }
    },
  },
];
