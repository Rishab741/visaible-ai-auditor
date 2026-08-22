import { computeSiteSignals, Category, CategoryScores } from '../signals';
import { EvalCase, assert, assertInRange } from './framework';
import { GOOD_SITE, BARE_SITE, CONFLICTING_FACTS_SITE, WALL_OF_TEXT_SITE } from './fixtures';

const ALL_CATEGORIES: Category[] = [
  'CONTENT_CLARITY',
  'PAGE_COVERAGE',
  'STRUCTURED_DATA',
  'INTERNAL_CONSISTENCY',
  'STRUCTURAL_SIGNALS',
];

function assertValidScores(categoryScores: CategoryScores, overallScore: number): void {
  for (const cat of ALL_CATEGORIES) {
    assertInRange(categoryScores[cat], 0, 100, `categoryScores.${cat}`);
  }
  assertInRange(overallScore, 0, 100, 'overallScore');
}

export const signalsEvalCases: EvalCase[] = [
  {
    name: 'signals: determinism — identical input yields byte-identical output',
    tier: 'fast',
    run: () => {
      const a = computeSiteSignals(GOOD_SITE.pages, GOOD_SITE.pageTypes);
      const b = computeSiteSignals(GOOD_SITE.pages, GOOD_SITE.pageTypes);
      assert(JSON.stringify(a) === JSON.stringify(b), 'two calls with the same input produced different output');
    },
  },
  {
    name: 'signals: all scores stay within [0, 100] across every fixture',
    tier: 'fast',
    run: () => {
      for (const fixture of [GOOD_SITE, BARE_SITE, CONFLICTING_FACTS_SITE, WALL_OF_TEXT_SITE]) {
        const { categoryScores, overallScore } = computeSiteSignals(fixture.pages, fixture.pageTypes);
        assertValidScores(categoryScores, overallScore);
      }
    },
  },
  {
    name: 'signals: complete site scores well and has few hard findings',
    tier: 'fast',
    run: () => {
      const { categoryScores, hardFindings } = computeSiteSignals(GOOD_SITE.pages, GOOD_SITE.pageTypes);
      assert(categoryScores.STRUCTURED_DATA >= 80, `expected STRUCTURED_DATA >= 80, got ${categoryScores.STRUCTURED_DATA}`);
      assert(categoryScores.PAGE_COVERAGE === 100, `expected full PAGE_COVERAGE, got ${categoryScores.PAGE_COVERAGE}`);
      assert(categoryScores.INTERNAL_CONSISTENCY === 100, 'consistent facts should score 100 on INTERNAL_CONSISTENCY');
      assert(hardFindings.length <= 1, `expected at most 1 hard finding on a complete site, got ${hardFindings.length}`);
    },
  },
  {
    name: 'signals: bare site flags missing Hotel schema and missing page coverage',
    tier: 'fast',
    run: () => {
      const { categoryScores, hardFindings } = computeSiteSignals(BARE_SITE.pages, BARE_SITE.pageTypes);
      assert(categoryScores.STRUCTURED_DATA < 50, `expected low STRUCTURED_DATA, got ${categoryScores.STRUCTURED_DATA}`);
      assert(categoryScores.PAGE_COVERAGE === 0, `expected 0 PAGE_COVERAGE (no rooms/amenities/etc.), got ${categoryScores.PAGE_COVERAGE}`);
      const schemaFinding = hardFindings.find((f) => f.category === 'STRUCTURED_DATA' && f.severity === 'HIGH');
      assert(!!schemaFinding, 'expected a HIGH severity STRUCTURED_DATA finding for missing Hotel schema');
      const coverageFinding = hardFindings.find((f) => f.category === 'PAGE_COVERAGE');
      assert(!!coverageFinding, 'expected a PAGE_COVERAGE finding for missing page types');
    },
  },
  {
    name: 'signals: conflicting check-in times are caught deterministically',
    tier: 'fast',
    run: () => {
      const { categoryScores, hardFindings } = computeSiteSignals(
        CONFLICTING_FACTS_SITE.pages,
        CONFLICTING_FACTS_SITE.pageTypes
      );
      assert(categoryScores.INTERNAL_CONSISTENCY < 100, 'conflicting facts must reduce INTERNAL_CONSISTENCY score');
      const conflict = hardFindings.find((f) => f.category === 'INTERNAL_CONSISTENCY' && f.severity === 'HIGH');
      assert(!!conflict, 'expected a HIGH severity INTERNAL_CONSISTENCY finding');
      assert(conflict!.fact.includes('3:00pm') && conflict!.fact.includes('4:00pm'), 'finding should name both conflicting values');
    },
  },
  {
    name: 'signals: dense wall-of-text paragraph is flagged',
    tier: 'fast',
    run: () => {
      const { hardFindings } = computeSiteSignals(WALL_OF_TEXT_SITE.pages, WALL_OF_TEXT_SITE.pageTypes);
      const finding = hardFindings.find((f) => f.category === 'STRUCTURAL_SIGNALS');
      assert(!!finding, 'expected a STRUCTURAL_SIGNALS finding for the dense paragraph');
    },
  },
  {
    name: 'signals: overallScore is a weighted function of categoryScores, not independent',
    tier: 'fast',
    run: () => {
      const good = computeSiteSignals(GOOD_SITE.pages, GOOD_SITE.pageTypes);
      const bare = computeSiteSignals(BARE_SITE.pages, BARE_SITE.pageTypes);
      assert(good.overallScore > bare.overallScore, 'a complete site must score higher overall than a bare one');
    },
  },
];
