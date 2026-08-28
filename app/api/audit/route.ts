import { NextRequest, NextResponse } from 'next/server';
import { startAuditScan, reapAllStaleScans } from '@/lib/pipeline';
import { prisma } from '@/lib/prisma';

// startAuditScan only resolves, checks the cache, and discovers/prioritizes
// URLs -- no full-page crawling or LLM analysis happens here anymore (that's
// stepAuditScan, called repeatedly from app/api/audit/[id]/step/route.ts).
// This should return in single-digit seconds; 30s is generous headroom, not
// a budget this route is expected to need.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { url, forceRefresh } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
    }

    const result = await startAuditScan(url.trim(), { forceRefresh: forceRefresh === true });
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
