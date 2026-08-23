import 'dotenv/config';
import { runSuite, report, EvalResult, EvalCase } from './framework';
import { signalsEvalCases } from './signals.eval';
import { resolverEvalCases } from './resolver.eval';
import { pipelineEvalCases } from './pipeline.eval';
import { investigatorEvalCases } from './investigator.eval';

const SUITES: Array<{ label: string; cases: EvalCase[] }> = [
  { label: 'signals (deterministic, no network)', cases: signalsEvalCases },
  { label: 'investigator (Phase 2 gap-filling agent)', cases: investigatorEvalCases },
  { label: 'resolver (live, real API calls)', cases: resolverEvalCases },
  { label: 'pipeline (live, real crawl + real API calls)', cases: pipelineEvalCases },
];

async function main() {
  const liveOnly = process.argv.includes('--live-only');
  const fastOnly = process.argv.includes('--fast-only');

  const results: EvalResult[] = [];

  for (const suite of SUITES) {
    const cases = suite.cases.filter((c) => (liveOnly ? c.tier === 'live' : fastOnly ? c.tier === 'fast' : true));
    if (cases.length === 0) continue;
    console.log(`\n=== ${suite.label} ===`);
    results.push(...(await runSuite(cases)));
  }

  const ok = report(results);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('Eval runner crashed:', err);
  process.exit(1);
});
