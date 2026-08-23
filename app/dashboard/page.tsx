import Link from 'next/link';
import { ArrowLeft, LayoutDashboard, ExternalLink, ChevronRight, FileText, ListChecks } from 'lucide-react';
import { prisma } from '@/lib/prisma';

function scoreTextClass(score: number): string {
  return score >= 75 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400';
}

function scoreRingClass(score: number): string {
  return score >= 75 ? 'border-emerald-500/40 bg-emerald-950/30' : score >= 50 ? 'border-amber-500/40 bg-amber-950/30' : 'border-rose-500/40 bg-rose-950/30';
}

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/70',
  FAILED: 'bg-red-950/70 text-red-400 border border-red-800/70',
  CRAWLING: 'bg-amber-950/70 text-amber-400 border border-amber-800/70',
  ANALYZING: 'bg-amber-950/70 text-amber-400 border border-amber-800/70',
  PENDING: 'bg-slate-800/70 text-slate-400 border border-slate-700/70',
};

function formatDate(iso: Date): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function DashboardPage() {
  const scans = await prisma.auditScan.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { _count: { select: { suggestions: true, pages: true } } },
  });

  return (
    <main className="aurora-backdrop min-h-screen text-slate-100 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8 animate-fade-in-up">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Search
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-8 animate-fade-in-up" style={{ animationDelay: '40ms' }}>
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-900/40 shrink-0">
            <LayoutDashboard className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Dashboard</h1>
            <p className="text-sm text-slate-400">
              {scans.length} audit{scans.length === 1 ? '' : 's'} on record
            </p>
          </div>
        </div>

        {scans.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 text-center text-slate-500 animate-fade-in-up">
            No audits yet.{' '}
            <Link href="/" className="text-indigo-400 hover:text-indigo-300">
              Run your first one.
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {scans.map((scan, idx) => (
              <Link
                key={scan.id}
                href={`/audit/${scan.id}`}
                className="glass-panel rounded-xl p-4 flex items-center gap-4 hover:border-white/20 hover:-translate-y-0.5 transition-all animate-fade-in-up"
                style={{ animationDelay: `${Math.min(idx, 12) * 30}ms` }}
              >
                {scan.status === 'COMPLETED' ? (
                  <div className={`h-11 w-11 rounded-full border flex items-center justify-center shrink-0 ${scoreRingClass(scan.overallScore)}`}>
                    <span className={`text-sm font-mono font-bold tabular-nums ${scoreTextClass(scan.overallScore)}`}>{scan.overallScore}</span>
                  </div>
                ) : (
                  <div className="h-11 w-11 rounded-full border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-mono text-slate-500">—</span>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white truncate">{scan.hotelName || scan.targetUrl}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold uppercase shrink-0 ${STATUS_STYLES[scan.status] ?? STATUS_STYLES.PENDING}`}>
                      {scan.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1">
                    {scan.targetUrl} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  </p>
                </div>

                <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 shrink-0">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> {scan._count.pages}
                  </span>
                  <span className="flex items-center gap-1">
                    <ListChecks className="h-3 w-3" /> {scan._count.suggestions}
                  </span>
                  <span className="w-24 text-right">{formatDate(scan.updatedAt)}</span>
                </div>

                <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
