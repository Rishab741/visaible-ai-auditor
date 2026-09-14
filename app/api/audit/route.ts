import { NextRequest, NextResponse, after } from 'next/server';
import { startAuditScan, driveAuditScan, scheduleDriveAllActiveScans, reapAllStaleScans } from '@/lib/pipeline';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, clientIp, rateLimitResponse } from '@/lib/rateLimit';

// Each POST spends a real Firecrawl call plus multiple LLM calls (more, on
// forceRefresh, which bypasses the scan cache entirely) -- with no auth in
// front of this route, an unbounded loop of requests has no ceiling on cost
// otherwise. 8 new audits per 10 minutes per IP is generous for a real user
// clicking around, not for a script.
const AUDIT_RATE_LIMIT = 8;
const AUDIT_RATE_WINDOW_MS = 10 * 60 * 1000;

// startAuditScan itself (resolve, cache-check, discover/prioritize URLs, no
// crawling) still returns in single-digit seconds -- the client gets its
// response immediately. maxDuration is 60 (not 30) because of the after()
// call below: once the response is sent, this invocation keeps running in
// the background via Vercel's waitUntil to self-drive real crawl/analysis
// progress, so a scan keeps advancing even if the client that started it
// never calls /step again (closed tab, dead network, a demo laptop going to
// sleep). Client polling (RunningClient.tsx) still drives the visible
// progress UI independently -- this is a resilience backstop underneath it.
// Also covers GET's own, smaller after() background drive below (route
// segment config applies to the whole file, not per-method).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { allowed, retryAfterMs } = await checkRateLimit(`audit:${clientIp(req)}`, AUDIT_RATE_LIMIT, AUDIT_RATE_WINDOW_MS);
    if (!allowed) {
      return rateLimitResponse(retryAfterMs, 'Too many audits requested from this address -- try again shortly.');
    }

    const { url, forceRefresh } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
    }

    const result = await startAuditScan(url.trim(), { forceRefresh: forceRefresh === true });
    if (!result.fromCache) {
      const deadline = Date.now() + 50_000; // margin under the 60s ceiling this invocation shares with the response above
      after(() => driveAuditScan(result.id, deadline));
    }
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Audit Pipeline Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to start AI visibility audit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Reap anything stuck before showing it -- a scan nobody's actively
    // polling should still read as FAILED here rather than hanging as
    // "in progress" forever.
    await reapAllStaleScans();
    // Also nudge any still-active scan forward in the background. The daily
    // Vercel Cron (see app/api/cron/advance-active-scans) is only a floor for
    // zero-traffic periods; piggybacking on every real homepage visit here
    // closes the gap far tighter than once-a-day ever could, for free.
    scheduleDriveAllActiveScans();
    const latestScans = await prisma.auditScan.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { suggestions: true, pages: true },
    });
    return NextResponse.json(latestScans);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch scans';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
