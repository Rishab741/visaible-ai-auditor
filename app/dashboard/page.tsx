import Link from 'next/link';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import DashboardClient, { type DashboardScan } from './DashboardClient';

export default async function DashboardPage() {
  const scans = await prisma.auditScan.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { _count: { select: { suggestions: true, pages: true } } },
  });

  const rows: DashboardScan[] = scans.map((s) => ({
    id: s.id,
    hotelName: s.hotelName,
    targetUrl: s.targetUrl,
    status: s.status,
    overallScore: s.overallScore,
    pageCount: s._count.pages,
    suggestionCount: s._count.suggestions,
    updatedAt: s.updatedAt.toISOString(),
  }));

  const completed = rows.filter((r) => r.status === 'COMPLETED');
  const avgScore = completed.length > 0 ? Math.round(completed.reduce((sum, r) => sum + r.overallScore, 0) / completed.length) : 0;
  const stats = {
    total: rows.length,
    avgScore,
    completed: completed.length,
    failed: rows.filter((r) => r.status === 'FAILED').length,
  };

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
              {rows.length} audit{rows.length === 1 ? '' : 's'} on record
            </p>
          </div>
        </div>

        <DashboardClient rows={rows} stats={stats} />
      </div>
    </main>
  );
}
