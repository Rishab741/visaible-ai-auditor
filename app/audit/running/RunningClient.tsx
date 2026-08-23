'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Compass, ScanSearch, BrainCircuit, ListChecks, CheckCircle2, Sparkles } from 'lucide-react';

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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Audit failed');
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
          <Link href="/" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
            ← Back to search
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="aurora-backdrop min-h-screen flex items-center justify-center text-slate-100 p-6">
      <div className="max-w-2xl w-full glass-panel rounded-2xl p-8 md:p-10 text-center animate-scale-in">
        <div className="mx-auto mb-6 h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-900/40">
          <Sparkles className="h-7 w-7 text-white animate-spin" style={{ animationDuration: '2s' }} />
        </div>
        <h1 className="text-xl font-bold text-white mb-1 truncate">Auditing {q}</h1>
        <p className="text-sm text-slate-400 mb-8">This can take a minute or two for a multi-page crawl — hang tight.</p>

        <div className="relative h-1 w-full overflow-hidden rounded-full bg-slate-800/80 mb-6">
          <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-indigo-500/0 via-indigo-400 to-indigo-500/0 animate-progress-sweep" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
          {LOADING_STAGES.map((stage, idx) => {
            const StageIcon = stage.icon;
            const isDone = idx < activeStage;
            const isActive = idx === activeStage;
            return (
              <div
                key={stage.label}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors duration-500 ${
                  isActive ? 'border-indigo-500/40 bg-indigo-950/40' : isDone ? 'border-emerald-800/50 bg-emerald-950/20' : 'border-white/10 bg-slate-950/40'
                }`}
              >
                <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                  {isActive && <span className="absolute h-6 w-6 rounded-full bg-indigo-400/40 animate-pulse-ring" />}
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <StageIcon className={`h-4 w-4 relative ${isActive ? 'text-indigo-300' : 'text-slate-600'}`} />
                  )}
                </div>
                <span className={`text-xs font-mono leading-tight ${isActive ? 'text-indigo-200' : isDone ? 'text-emerald-300/80' : 'text-slate-600'}`}>
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>

        {errorMsg && (
          <div className="mt-6 p-4 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-sm text-left animate-fade-in-up">
            {errorMsg}
            <div className="mt-2">
              <Link href="/" className="text-indigo-400 hover:text-indigo-300 text-xs font-medium">
                ← Back to search
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
