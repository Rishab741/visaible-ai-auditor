import { LayoutDashboard } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import TopNav from '@/app/components/TopNav';
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
    <main className="aurora-backdrop min-h-screen text-slate-100 flex flex-col">
      <TopNav />
      <div className="max-w-5xl mx-auto w-full p-6 md:p-12">
        <div className="flex items-center gap-3 mb-8 animate-fade-in-up">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center shadow-lg shadow-cyan-900/30 shrink-0">
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
