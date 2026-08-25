'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Search, Building2, UtensilsCrossed } from 'lucide-react';
import TopNav from './components/TopNav';

interface RecentAudit {
  id: string;
  hotelName: string;
  targetUrl: string;
  overallScore: number;
  updatedAt: string;
}

function scoreTextClass(score: number): string {
  return score >= 75 ? 'text-cyan-400' : score >= 50 ? 'text-violet-400' : 'text-rose-400';
}

function scoreBarClass(score: number): string {
  return score >= 75 ? 'bg-cyan-400' : score >= 50 ? 'bg-violet-400' : 'bg-rose-400';
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

const presets = [
  {
    name: 'The Fullerton Hotel Sydney',
    subtitle: 'Hospitality visibility scan',
    url: 'https://www.fullertonhotels.com/fullerton-hotel-sydney',
    icon: Building2,
    accent: 'cyan',
  },
  {
    name: 'Ace Hotel Sydney',
    subtitle: 'Boutique property audit',
    url: 'https://acehotel.com/sydney',
    icon: Building2,
    accent: 'violet',
  },
  {
    name: 'In-N-Out Burger',
    subtitle: 'Restaurant chain scan',
    url: 'https://www.in-n-out.com',
    icon: UtensilsCrossed,
    accent: 'cyan',
  },
] as const;

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

  const startAudit = (query: string) => {
    if (!query.trim()) return;
    router.push(`/audit/running?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <main className="aurora-backdrop min-h-screen text-slate-100 flex flex-col">
      <TopNav />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          {/* Hero */}
          <div className="text-center mb-10 animate-fade-in-up">
            <span className="inline-block bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-mono text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shadow-lg shadow-cyan-900/30 mb-4">
              Pilot
            </span>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-3">
              Optimize for the Era of <span className="text-gradient-animated">AI Answer Engines</span>
            </h1>
            <p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto">
              Audit your local business&apos;s visibility across ChatGPT, Perplexity &amp; Gemini —
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
                  placeholder="Enter Business Name or URL..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  autoFocus
                  className="w-full bg-slate-950/70 border border-white/10 text-white pl-12 pr-4 py-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-shadow font-mono text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={!urlInput.trim()}
                className="bg-cyan-400 hover:bg-cyan-300 active:scale-[0.98] text-slate-950 font-bold font-mono uppercase tracking-wider text-sm px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:active:scale-100 shadow-lg shadow-cyan-500/20"
              >
                <Search className="h-4 w-4" />
                Audit Now
              </button>
            </form>
          </div>

          {/* Presets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 animate-fade-in-up" style={{ animationDelay: '110ms' }}>
            {presets.map((preset) => {
              const Icon = preset.icon;
              const isCyan = preset.accent === 'cyan';
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => startAudit(preset.url)}
                  className="glass-panel rounded-xl p-4 text-left hover:border-white/20 hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-wider">Preset</span>
                    <Icon className={`h-4 w-4 ${isCyan ? 'text-cyan-400' : 'text-violet-400'}`} />
                  </div>
                  <p className="text-sm font-bold text-white truncate">{preset.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{preset.subtitle}</p>
                </button>
              );
            })}
          </div>

          {/* Recent Audits */}
          {recentAudits.length > 0 && (
            <div className="mt-8 animate-fade-in-up" style={{ animationDelay: '140ms' }}>
              <p className="text-sm font-bold text-white mb-3">Recent Audits</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {recentAudits.slice(0, 3).map((scan) => (
                  <button
                    key={scan.id}
                    type="button"
                    onClick={() => router.push(`/audit/${scan.id}`)}
                    className="glass-panel rounded-xl p-4 text-left hover:border-white/20 hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-white truncate max-w-[140px]">{scan.hotelName || scan.targetUrl}</span>
                      <span className={`text-sm font-mono font-bold tabular-nums ${scoreTextClass(scan.overallScore)}`}>{scan.overallScore}%</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden mb-2">
                      <div className={`h-full rounded-full ${scoreBarClass(scan.overallScore)}`} style={{ width: `${scan.overallScore}%` }} />
                    </div>
                    <p className="text-[11px] font-mono text-slate-500">Scanned {timeAgo(scan.updatedAt)}</p>
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
