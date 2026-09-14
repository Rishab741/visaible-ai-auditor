import 'dotenv/config';
import { startAuditScan, stepAuditScan } from '../lib/pipeline';
import { prisma } from '../lib/prisma';

async function main() {
  const target = process.argv[2] || 'https://www.in-n-out.com';
  console.log(`Timing full pipeline for: ${target}\n`);

  const t0 = Date.now();
  const startResult = await startAuditScan(target, { forceRefresh: true });
  const startMs = Date.now() - t0;
  console.log(`startAuditScan: ${startMs}ms`);

  if (startResult.fromCache) {
    console.log('Unexpectedly served from cache despite forceRefresh -- aborting.');
    process.exit(1);
  }

  const id = startResult.id;
  let lastStatus = 'PENDING';
  let phaseStart = Date.now();
  const phaseTimings: Record<string, number> = {};
  let stepCount = 0;

  while (true) {
    const t = Date.now();
    const result = await stepAuditScan(id);
    const stepMs = Date.now() - t;
    stepCount++;
    console.log(
      `  step ${stepCount}: status=${result.status} done=${result.done} locked=${result.locked ?? false} progress=${JSON.stringify(result.progress ?? null)} (${stepMs}ms)`
    );

    if (result.status !== lastStatus) {
      phaseTimings[lastStatus] = (phaseTimings[lastStatus] ?? 0) + (Date.now() - phaseStart);
      phaseStart = Date.now();
      lastStatus = result.status;
    }

    if (result.done) {
      phaseTimings[lastStatus] = (phaseTimings[lastStatus] ?? 0) + (Date.now() - phaseStart);
      break;
    }
    if (result.locked) {
      // Same as RunningClient.tsx in production: locked is transient (claim
      // lost a race, or -- likely here -- a read-after-write lag blip against
      // the managed Postgres proxy right after the previous step's write,
      // exposed by this script's zero-delay loop where real client polling
      // always has a natural ~1.5s gap). Back off briefly and retry rather
      // than treating it as fatal.
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
  }

  const totalMs = Date.now() - t0;
  console.log('\n=== Phase breakdown ===');
  for (const [phase, ms] of Object.entries(phaseTimings)) {
    console.log(`  ${phase}: ${(ms / 1000).toFixed(1)}s`);
  }
  console.log(`  TOTAL (incl. startAuditScan): ${(totalMs / 1000).toFixed(1)}s`);

  const scan = await prisma.auditScan.findUnique({ where: { id }, include: { pages: true, suggestions: true } });
  console.log(`\npages crawled: ${scan?.pages.length}, failed: ${(scan?.crawlFailedUrls as string[] | null)?.length ?? 0}, suggestions: ${scan?.suggestions.length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
