import { NextRequest, NextResponse } from 'next/server';
import { stepAuditScan } from '@/lib/pipeline';

// Each call advances a scan by one bounded unit of work (one crawl chunk, or
// one full INVESTIGATING/ANALYZING pass) -- callers (RunningClient.tsx) loop
// this until `done`. Keeping the full 60s headroom here even though a single
// chunk is sized to land well under it (see CRAWL_CHUNK_SIZE in
// lib/pipeline.ts) -- a slow page under its own fetch timeout is still real
// wall-clock time this route needs to allow for.
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await stepAuditScan(id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error(`[audit ${id}] step error:`, error);
    const message = error instanceof Error ? error.message : 'Failed to advance audit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
