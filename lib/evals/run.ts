import 'dotenv/config';
import { runSuite, report, EvalResult } from './framework';
import { signalsEvalCases } from './signals.eval';
import { resolverEvalCases } from './resolver.eval';
import { pipelineEvalCases } from './pipeline.eval';

async function main() {
  const liveOnly = process.argv.includes('--live-only');
  const fastOnly = process.argv.includes('--fast-only');

  const results: EvalResult[] = [];

  if (!liveOnly) {
    console.log('\n=== signals (fast, deterministic, no network) ===');
    results.push(...(await runSuite(signalsEvalCases)));
  }

  if (!fastOnly) {
    console.log('\n=== resolver (live, real API calls) ===');
    results.push(...(await runSuite(resolverEvalCases)));

    console.log('\n=== pipeline (live, real crawl + real API calls) ===');
    results.push(...(await runSuite(pipelineEvalCases)));
  }

  const ok = report(results);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('Eval runner crashed:', err);
  process.exit(1);
});
