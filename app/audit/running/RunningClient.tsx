'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Compass, ScanSearch, BrainCircuit, ListChecks, CheckCircle2, Loader2 } from 'lucide-react';
import TopNav from '@/app/components/TopNav';

const LOADING_STAGES = [
  { label: 'Discovering all pages & routes', icon: Compass },
  { label: 'Crawling & extracting content', icon: ScanSearch },
  { label: 'Cross-referencing facts across pages', icon: BrainCircuit },
  { label: 'Generating AI visibility suggestions', icon: ListChecks },
];

export default function RunningClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const forceRefresh = searchParams.get('forceRefresh') === 'true';

  const [activeStage, setActiveStage] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!q || startedRef.current) return;
    startedRef.current = true;

    // The audit is a single request/response, so these timers approximate
    // real pipeline phases (discovery -> crawl -> cross-reference -> generate)
    // to keep this screen legible during a multi-minute multi-page scan.
    const stageTimers = [
      setTimeout(() => setActiveStage(1), 6000),
      setTimeout(() => setActiveStage(2), 20000),
      setTimeout(() => setActiveStage(3), 32000),
    ];

    fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: q, forceRefresh }),
    })
      .then(async (res) => {
        // The API route always returns JSON, even on its own errors — but a
        // failure outside the route (a platform/proxy timeout, the dev
        // server restarting mid-request) can hand back plain text or an
        // HTML error page instead. Never call res.json() on that blindly:
        // check res.ok first, and degrade to a readable message instead of
        // letting a raw "Unexpected token..." parse error reach the user.
        if (!res.ok) {
          let message = `Audit failed (HTTP ${res.status})`;
          try {
            const errJson = await res.json();
            if (errJson?.error) message = errJson.error;
          } catch {
            // Body wasn't JSON — keep the generic status-based message.
          }
          throw new Error(message);
        }
        const data = await res.json();
        router.replace(`/audit/${data.id}`);
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred during analysis.');
      })
      .finally(() => {
        stageTimers.forEach(clearTimeout);
      });

    return () => stageTimers.forEach(clearTimeout);
  }, [q, forceRefresh, router]);

  if (!q) {
    return (
      <main className="aurora-backdrop min-h-screen flex items-center justify-center text-slate-100 p-6">
        <div className="text-center">
          <p className="text-slate-400 mb-4">No search query provided.</p>
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-sm font-medium">
            ← Back to search
          </Link>
        </div>
      </main>
    );
  }

  const progressPct = Math.round((activeStage / LOADING_STAGES.length) * 100);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (progressPct / 100) * circumference;

  return (
    <main className="aurora-backdrop min-h-screen text-slate-100 flex flex-col">
      <TopNav />

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full animate-scale-in">
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-1.5 truncate">Analyzing {q}</h1>
              <p className="text-sm text-slate-400 max-w-lg">
                Arthur is crawling, cross-referencing, and evaluating AI visibility. This can take a minute or two for a multi-page scan.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-cyan-400 border border-cyan-500/30 bg-cyan-950/30 px-3 py-1.5 rounded-full shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" /> Engine Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
            {/* Gauge + current stage */}
            <div className="glass-panel rounded-2xl p-6 flex flex-col items-center text-center">
              <div className="relative" style={{ width: 140, height: 140 }}>
                <svg width={140} height={140} className="-rotate-90">
                  <circle cx={70} cy={70} r={54} fill="none" strokeWidth={9} className="stroke-slate-800" />
                  <circle
                    cx={70}
                    cy={70}
                    r={54}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth={9}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="gauge-ring"
                    style={{ filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.55))' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-white tabular-nums">{progressPct}%</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Completed</span>
                </div>
              </div>
              <p className="text-sm font-bold text-white mt-5">{LOADING_STAGES[activeStage]?.label ?? 'Finalizing report'}</p>
              <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden mt-3">
                <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-700 ease-out" style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            {/* Live audit log */}
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400">Live Audit Log</span>
              </div>
              <div className="p-4 space-y-2.5 font-mono text-xs bg-black/30 min-h-[200px]">
                {LOADING_STAGES.map((stage, idx) => {
                  const isDone = idx < activeStage;
                  const isActive = idx === activeStage;
                  const isPending = idx > activeStage;
                  return (
                    <div key={stage.label} className="flex items-start gap-2.5">
                      {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />}
                      {isActive && <Loader2 className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5 animate-spin" />}
                      {isPending && <span className="h-3.5 w-3.5 shrink-0 mt-0.5 flex items-center justify-center text-slate-700">·</span>}
                      <span className={isDone ? 'text-cyan-300/80' : isActive ? 'text-cyan-200 font-semibold' : 'text-slate-600'}>
                        {stage.label}
                        {isActive && <span className="text-cyan-400 animate-pulse">_</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="mt-6 p-4 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-sm text-left animate-fade-in-up">
              {errorMsg}
              <div className="mt-2">
                <Link href="/" className="text-cyan-400 hover:text-cyan-300 text-xs font-medium">
                  ← Back to search
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
