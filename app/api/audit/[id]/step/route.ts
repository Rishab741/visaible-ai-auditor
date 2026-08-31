import { NextRequest, NextResponse, after } from 'next/server';
import { stepAuditScan, driveAuditScan } from '@/lib/pipeline';

// Each call advances a scan by one bounded unit of work (one crawl chunk, or
// one full INVESTIGATING/ANALYZING pass) -- callers (RunningClient.tsx) loop
// this until `done`. Keeping the full 60s headroom here even though a single
// chunk is sized to land well under it (see CRAWL_CHUNK_SIZE in
// lib/pipeline.ts) -- a slow page under its own fetch timeout is still real
// wall-clock time this route needs to allow for, and it's also the budget
// the after() background continuation below shares with the response.
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await stepAuditScan(id);
    if (!result.done && !result.locked) {
      // The client got its one real step already -- this schedules extra
      // background progress on top of it (via Vercel's waitUntil, after the
      // response is sent) so the scan keeps advancing even if this was the
      // client's last poll (tab closed, network dropped, etc).
      const deadline = Date.now() + 50_000;
      after(() => driveAuditScan(id, deadline));
    }
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error(`[audit ${id}] step error:`, error);
    const message = error instanceof Error ? error.message : 'Failed to advance audit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
