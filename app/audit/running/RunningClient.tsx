'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Compass, ScanSearch, BrainCircuit, ListChecks, CheckCircle2, Loader2 } from 'lucide-react';
import TopNav from '@/app/components/TopNav';
import type { StepResult } from '@/lib/pipeline';

const LOADING_STAGES = [
  { label: 'Discovering all pages & routes', icon: Compass },
  { label: 'Crawling & extracting content', icon: ScanSearch },
  { label: 'Cross-referencing facts across pages', icon: BrainCircuit },
  { label: 'Generating AI visibility suggestions', icon: ListChecks },
];

// Maps the real AuditScan.status values (see lib/pipeline.ts's step
// machine) onto the 4 display stages above.
const STATUS_STAGE: Record<string, number> = {
  PENDING: 0,
  CRAWLING: 1,
  INVESTIGATING: 2,
  ANALYZING: 3,
};

const POLL_INTERVAL_MS = 1500;
// Belt-and-suspenders with the server-side staleness reap (lib/pipeline.ts's
// ABANDONED_MS) -- gives up client-side well before that so a dead scan
// doesn't leave this tab spinning for the full server-side window.
const MAX_WALL_CLOCK_MS = 3 * 60 * 1000;
const MAX_CONSECUTIVE_LOCKED = 20;
const MAX_CONSECUTIVE_ERRORS = 5;

async function parseErrorMessage(res: Response): Promise<string> {
  let message = `Audit failed (HTTP ${res.status})`;
  try {
    const errJson = await res.json();
    if (errJson?.error) message = errJson.error;
  } catch {
    // Body wasn't JSON -- keep the generic status-based message.
  }
  return message;
}

export default function RunningClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const forceRefresh = searchParams.get('forceRefresh') === 'true';
  const resumeId = searchParams.get('resume');

  const [status, setStatus] = useState<string>('PENDING');
  const [progress, setProgress] = useState<{ crawled: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if ((!q && !resumeId) || startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const pollStartTime = Date.now();
    let consecutiveLocked = 0;
    let consecutiveErrors = 0;

    async function pollStep(id: string) {
      if (cancelled) return;

      if (Date.now() - pollStartTime > MAX_WALL_CLOCK_MS) {
        setErrorMsg('This audit is taking longer than expected. It will keep running in the background -- check the dashboard shortly, or try again.');
        return;
      }

      try {
        const res = await fetch(`/api/audit/${id}/step`, { method: 'POST' });
        if (!res.ok) throw new Error(await parseErrorMessage(res));

        const step: StepResult = await res.json();
        consecutiveErrors = 0;

        if (step.locked) {
          consecutiveLocked++;
          if (consecutiveLocked > MAX_CONSECUTIVE_LOCKED) {
            setErrorMsg('This audit is taking longer than expected. It will keep running in the background -- check the dashboard shortly, or try again.');
            return;
          }
          timeoutId = setTimeout(() => pollStep(id), POLL_INTERVAL_MS);
          return;
        }
        consecutiveLocked = 0;

        setStatus(step.status);
        setProgress(step.progress ?? null);

        if (step.done) {
          if (step.status === 'COMPLETED') {
            router.replace(`/audit/${id}`);
          } else {
            setErrorMsg(step.error || 'Audit failed.');
          }
          return;
        }

        timeoutId = setTimeout(() => pollStep(id), POLL_INTERVAL_MS);
      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
          setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred during analysis.');
          return;
        }
        timeoutId = setTimeout(() => pollStep(id), POLL_INTERVAL_MS);
      }
    }

    async function start() {
      if (resumeId) {
        pollStep(resumeId);
        return;
      }
      try {
        const res = await fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: q, forceRefresh }),
        });
        if (!res.ok) throw new Error(await parseErrorMessage(res));

        const data = await res.json();
        if (data.fromCache) {
          router.replace(`/audit/${data.scan.id}`);
          return;
        }
        pollStep(data.id);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred during analysis.');
      }
    }

    start();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [q, forceRefresh, resumeId, router]);

  if (!q && !resumeId) {
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

  const activeStage = STATUS_STAGE[status] ?? 0;
  // CRAWLING is the only stage with real sub-progress from the server (a
  // page count) -- the others advance in one jump when their step completes,
  // so fold in a fraction only there instead of pretending precision we
  // don't have.
  const stageFraction = status === 'CRAWLING' && progress && progress.total > 0 ? Math.min(progress.crawled / progress.total, 1) : 0;
  const progressPct = Math.round(((activeStage + stageFraction) / LOADING_STAGES.length) * 100);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (progressPct / 100) * circumference;

  return (
    <main className="aurora-backdrop min-h-screen text-slate-100 flex flex-col">
      <TopNav />

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full animate-scale-in">
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-1.5 truncate">Analyzing {q || '…'}</h1>
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
              {status === 'CRAWLING' && progress && progress.total > 0 && (
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">{progress.crawled} / {progress.total} pages</p>
              )}
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
