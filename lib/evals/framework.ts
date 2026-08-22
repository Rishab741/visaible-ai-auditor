export interface EvalCase {
  name: string;
  tier: 'fast' | 'live';
  run: () => Promise<void> | void;
}

export interface EvalResult {
  name: string;
  tier: EvalCase['tier'];
  pass: boolean;
  message?: string;
  durationMs: number;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertInRange(value: number, min: number, max: number, label: string): void {
  assert(value >= min && value <= max, `${label} = ${value}, expected within [${min}, ${max}]`);
}

export async function runCase(evalCase: EvalCase): Promise<EvalResult> {
  const start = Date.now();
  try {
    await evalCase.run();
    return { name: evalCase.name, tier: evalCase.tier, pass: true, durationMs: Date.now() - start };
  } catch (err) {
    return {
      name: evalCase.name,
      tier: evalCase.tier,
      pass: false,
      message: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

export async function runSuite(cases: EvalCase[]): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const c of cases) {
    const result = await runCase(c);
    const icon = result.pass ? '✓' : '✗';
    console.log(`  ${icon} [${result.tier}] ${result.name} (${result.durationMs}ms)`);
    if (!result.pass) console.log(`      ${result.message}`);
    results.push(result);
  }
  return results;
}

export function report(allResults: EvalResult[]): boolean {
  const failed = allResults.filter((r) => !r.pass);
  const passed = allResults.length - failed.length;
  console.log(`\n${passed}/${allResults.length} passed`);
  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const f of failed) {
      console.log(`  ✗ [${f.tier}] ${f.name}: ${f.message}`);
    }
  }
  return failed.length === 0;
}
