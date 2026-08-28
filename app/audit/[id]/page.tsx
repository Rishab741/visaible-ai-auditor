import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { reapIfStale } from '@/lib/pipeline';
import { AuditScanResult } from '@/app/components/AuditReport';
import TopNav from '@/app/components/TopNav';
import AuditResultClient from './AuditResultClient';

export default async function AuditResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // A scan nobody's actively polling might have gone stale since it was last
  // touched -- catch it here too, not just from stepAuditScan's own check,
  // so a direct visit to this page always sees a legible terminal status.
  await reapIfStale(id);

  const scan = await prisma.auditScan.findUnique({
    where: { id },
    include: { pages: true, suggestions: true },
  });

  if (!scan) {
    notFound();
  }

  // Now that scans are worked in short chunks across many requests instead
  // of one blocking call, a scan can legitimately still be mid-flight when
  // this page loads (e.g. a user navigates here directly, or refreshes
  // mid-run) -- resume polling instead of rendering AuditReport against
  // mostly-empty data.
  if (scan.status !== 'COMPLETED' && scan.status !== 'FAILED') {
    redirect(`/audit/running?q=${encodeURIComponent(scan.targetUrl)}&resume=${scan.id}`);
  }

  if (scan.status === 'FAILED') {
    return (
      <main className="aurora-backdrop min-h-screen text-slate-100 flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-lg w-full glass-panel rounded-2xl p-8 text-center animate-fade-in-up">
            <h1 className="text-xl font-bold text-white mb-2">Audit failed</h1>
            <p className="text-sm text-slate-400 mb-1">{scan.targetUrl}</p>
            <p className="text-sm text-rose-300 mt-4 mb-6">{scan.failureReason || 'The audit could not be completed.'}</p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href={`/audit/running?q=${encodeURIComponent(scan.targetUrl)}&forceRefresh=true`}
                className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
              >
                Retry audit
              </Link>
              <Link href="/dashboard" className="text-sm font-medium text-slate-400 hover:text-white">
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // categoryScores is a validated Json column written exclusively by
  // lib/signals.ts's computeSiteSignals — always a flat string->number map or
  // null, just not something Prisma's generic JsonValue type can express.
  return <AuditResultClient initialScan={scan as unknown as AuditScanResult} />;
}
