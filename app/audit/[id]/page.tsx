import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AuditScanResult } from '@/app/components/AuditReport';
import AuditResultClient from './AuditResultClient';

export default async function AuditResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const scan = await prisma.auditScan.findUnique({
    where: { id },
    include: { pages: true, suggestions: true },
  });

  if (!scan) {
    notFound();
  }

  // categoryScores is a validated Json column written exclusively by
  // lib/signals.ts's computeSiteSignals — always a flat string->number map or
  // null, just not something Prisma's generic JsonValue type can express.
  return <AuditResultClient initialScan={scan as unknown as AuditScanResult} />;
}
