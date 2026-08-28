'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ExternalLink, FileText, ListChecks, ArrowUpDown, ChevronRight } from 'lucide-react';

export interface DashboardScan {
  id: string;
  hotelName: string | null;
  targetUrl: string;
  status: string;
  overallScore: number;
  pageCount: number;
  suggestionCount: number;
  updatedAt: string;
}

interface Stats {
  total: number;
  avgScore: number;
  completed: number;
  failed: number;
}

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-cyan-950/70 text-cyan-400 border border-cyan-800/70',
  FAILED: 'bg-rose-950/70 text-rose-400 border border-rose-800/70',
  CRAWLING: 'bg-violet-950/70 text-violet-400 border border-violet-800/70',
  ANALYZING: 'bg-violet-950/70 text-violet-400 border border-violet-800/70',
  PENDING: 'bg-slate-800/70 text-slate-400 border border-slate-700/70',
};

const IN_PROGRESS_STATUSES = new Set(['PENDING', 'CRAWLING', 'ANALYZING']);

type FilterKey = 'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'FAILED';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'FAILED', label: 'Failed' },
];

type SortKey = 'recent' | 'score-desc' | 'score-asc';

function scoreTextClass(score: number): string {
  return score >= 75 ? 'text-cyan-400' : score >= 50 ? 'text-violet-400' : 'text-rose-400';
}

function scoreBarClass(score: number): string {
  return score >= 75 ? 'bg-cyan-400' : score >= 50 ? 'bg-violet-400' : 'bg-rose-400';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ScoreMeter({ score, isComplete }: { score: number; isComplete: boolean }) {
  if (!isComplete) {
    return <span className="text-xs font-mono text-slate-600">—</span>;
  }
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-14 h-1.5 rounded-full bg-slate-800 overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${scoreBarClass(score)}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-sm font-mono font-bold tabular-nums ${scoreTextClass(score)}`}>{score}</span>
    </div>
  );
}

export default function DashboardClient({ rows, stats }: { rows: DashboardScan[]; stats: Stats }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [sort, setSort] = useState<SortKey>('recent');

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = rows.filter((r) => {
      if (q && !(r.hotelName?.toLowerCase().includes(q) || r.targetUrl.toLowerCase().includes(q))) return false;
      if (filter === 'COMPLETED') return r.status === 'COMPLETED';
      if (filter === 'FAILED') return r.status === 'FAILED';
      if (filter === 'IN_PROGRESS') return IN_PROGRESS_STATUSES.has(r.status);
      return true;
    });

    if (sort === 'score-desc') result = [...result].sort((a, b) => b.overallScore - a.overallScore);
    else if (sort === 'score-asc') result = [...result].sort((a, b) => a.overallScore - b.overallScore);
    // 'recent' relies on the server's own updatedAt-desc ordering — no re-sort needed.

    return result;
  }, [rows, query, filter, sort]);

  return (
    <div className="space-y-5">
      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Audits</p>
          <p className="text-2xl font-black text-white mt-1 tabular-nums">{stats.total}</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg Score</p>
          <p className={`text-2xl font-black mt-1 tabular-nums ${scoreTextClass(stats.avgScore)}`}>{stats.avgScore}</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Completed</p>
          <p className="text-2xl font-black text-cyan-400 mt-1 tabular-nums">{stats.completed}</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Failed</p>
          <p className="text-2xl font-black text-rose-400 mt-1 tabular-nums">{stats.failed}</p>
        </div>
      </div>

      {/* Filters + search + sort, one row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 animate-fade-in-up" style={{ animationDelay: '80ms' }}>
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg p-1 shrink-0">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                filter === f.key ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by business or URL..."
            className="w-full bg-white/5 border border-white/10 text-white text-xs pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-shadow"
          />
        </div>

        <div className="relative shrink-0">
          <ArrowUpDown className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="appearance-none bg-white/5 border border-white/10 text-white text-xs pl-9 pr-8 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer"
          >
            <option value="recent" className="bg-slate-900">Most Recent</option>
            <option value="score-desc" className="bg-slate-900">Highest Score</option>
            <option value="score-asc" className="bg-slate-900">Lowest Score</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center text-slate-500 animate-fade-in-up">
          No audits yet.{' '}
          <Link href="/" className="text-cyan-400 hover:text-cyan-300">
            Run your first one.
          </Link>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center text-slate-500 animate-fade-in-up">
          No audits match your filters.
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Business</th>
                  <th className="text-left px-4 py-3">Score</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Pages</th>
                  <th className="text-right px-4 py-3">Fixes</th>
                  <th className="text-right px-5 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((scan) => (
                  <tr
                    key={scan.id}
                    tabIndex={0}
                    role="link"
                    onClick={() => router.push(`/audit/${scan.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/audit/${scan.id}`);
                      }
                    }}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors group cursor-pointer focus-visible:outline-none focus-visible:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-500"
                  >
                    <td className="px-5 py-3.5 max-w-0">
                      <p className="text-sm font-medium text-white truncate">{scan.hotelName || scan.targetUrl}</p>
                      <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                        {scan.targetUrl} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <ScoreMeter score={scan.overallScore} isComplete={scan.status === 'COMPLETED'} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold uppercase whitespace-nowrap ${STATUS_STYLES[scan.status] ?? STATUS_STYLES.PENDING}`}>
                        {scan.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 tabular-nums">
                        <FileText className="h-3 w-3" /> {scan.pageCount}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 tabular-nums">
                        <ListChecks className="h-3 w-3" /> {scan.suggestionCount}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {formatDate(scan.updatedAt)}
                        <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
