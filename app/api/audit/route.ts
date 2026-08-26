import { NextRequest, NextResponse } from 'next/server';
import { runAuditScan } from '@/lib/pipeline';
import { prisma } from '@/lib/prisma';

// Without this, Vercel defaults every function to a 10s cap regardless of
// plan -- and a fresh (non-cached) audit routinely runs well past that
// (multi-page crawl + LLM analysis). 60s is the hard ceiling on the Hobby
// plan; this raises us to it. A very large site can still exceed even that,
// at which point the only remaining levers are a paid plan (up to 300s) or
// trimming pipeline scope -- not something to silently paper over here.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { url, forceRefresh } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
    }

    const auditResult = await runAuditScan(url.trim(), { forceRefresh: forceRefresh === true });
    return NextResponse.json(auditResult);
  } catch (error: unknown) {
    console.error('Audit Pipeline Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to complete AI visibility audit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
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