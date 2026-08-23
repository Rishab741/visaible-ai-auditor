'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Globe, Search, Clock, LayoutDashboard } from 'lucide-react';

interface RecentAudit {
  id: string;
  hotelName: string;
  targetUrl: string;
  overallScore: number;
  updatedAt: string;
}

function scoreTextClass(score: number): string {
  return score >= 75 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400';
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function HomePage() {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState('');
  const [recentAudits, setRecentAudits] = useState<RecentAudit[]>([]);

  useEffect(() => {
    fetch('/api/audit')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRecentAudits(data);
      })
      .catch(() => {});
  }, []);

  const presets = [
    { name: 'The Fullerton Hotel Sydney', url: 'https://www.fullertonhotels.com/fullerton-hotel-sydney' },
    { name: 'Ace Hotel Sydney', url: 'https://acehotel.com/sydney' },
    { name: 'Crown Towers Sydney', url: 'https://www.crownhotels.com.au/sydney/crown-towers' },
  ];

  const startAudit = (query: string) => {
    if (!query.trim()) return;
    router.push(`/audit/running?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <main className="aurora-backdrop min-h-screen text-slate-100 flex flex-col items-center justify-center p-6 relative">
      <Link
        href="/dashboard"
        className="absolute top-6 right-6 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors animate-fade-in-up"
      >
        <LayoutDashboard className="h-4 w-4" /> Dashboard
      </Link>

      <div className="w-full max-w-2xl">
        {/* Hero */}
        <div className="text-center mb-10 animate-fade-in-up">
          <span className="inline-block bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-mono text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shadow-lg shadow-indigo-900/40 mb-4">
            Pilot
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-3">
            Visaible <span className="text-gradient-animated">AI Visibility Auditor</span>
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto">
            See how clearly ChatGPT, Perplexity &amp; Gemini can extract, trust, and recommend a hotel property —
            and exactly what to fix.
          </p>
        </div>

        {/* Search */}
        <div className="glass-panel rounded-2xl p-6 md:p-7 shadow-2xl shadow-black/30 animate-fade-in-up" style={{ animationDelay: '80ms' }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startAudit(urlInput);
            }}
            className="flex flex-col md:flex-row gap-3"
          >
            <div className="relative flex-1">
              <Globe className="absolute left-4 top-3.5 h-5 w-5 text-slate-500" />
              <input
                type="text"
                placeholder="Enter a hotel website URL or name (e.g. https://www.examplehotel.com)"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                autoFocus
                className="w-full bg-slate-950/70 border border-white/10 text-white pl-12 pr-4 py-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow font-mono text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!urlInput.trim()}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white font-semibold px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:active:scale-100 shadow-lg shadow-indigo-900/30"
            >
              <Search className="h-4 w-4" />
              Run AI Audit
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Demo Presets:</span>
            {presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => startAudit(preset.url)}
                className="bg-white/5 hover:bg-white/10 text-slate-300 px-2.5 py-1 rounded-full border border-white/10 transition-colors"
              >
                {preset.name}
              </button>
            ))}
          </div>

          {recentAudits.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Recent Audits
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {recentAudits.map((scan) => (
                  <button
                    key={scan.id}
                    type="button"
                    onClick={() => router.push(`/audit/${scan.id}`)}
                    className="shrink-0 flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-left transition-colors"
                  >
                    <span className={`text-xs font-mono font-bold tabular-nums ${scoreTextClass(scan.overallScore)}`}>{scan.overallScore}</span>
                    <span className="text-xs text-slate-300 max-w-[140px] truncate">{scan.hotelName || scan.targetUrl}</span>
                    <span className="text-[10px] text-slate-600 shrink-0">{timeAgo(scan.updatedAt)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
