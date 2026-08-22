import { NextRequest, NextResponse } from 'next/server';
import { runAuditScan } from '@/lib/pipeline';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
    }

    const auditResult = await runAuditScan(url.trim());
    return NextResponse.json(auditResult);
  } catch (error: any) {
    console.error('Audit Pipeline Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to complete AI visibility audit' },
      { status: 500 }
    );
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}