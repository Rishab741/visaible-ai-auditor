import { NextRequest, NextResponse } from 'next/server';
import { runAuditScan } from '@/lib/pipeline';
import { prisma } from '@/lib/prisma';

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