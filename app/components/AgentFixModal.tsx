'use client';

import { useEffect, useRef, useState } from 'react';
import { FileSearch, ScanSearch, Wand2, ShieldCheck, CheckCircle2, X, Bot, Loader2, MinusCircle } from 'lucide-react';

export const AGENT_NAME = 'Arthur';

// Conceptual phases of the fix-generation flow, shown as an animated stepper.
// This is a UI-side mapping of the agentic flow, not a claim of new backend
// orchestration — the real work is still the single existing bulk endpoint;
// these phases just narrate what that call is conceptually doing while it's
// in flight. Timing is heuristic, same pattern as the audit-running screen.
const AGENT_PHASES = [
  { label: 'Reading flagged suggestions', icon: FileSearch },
  { label: 'Cross-referencing crawled page content', icon: ScanSearch },
  { label: 'Drafting implementation snippets', icon: Wand2 },
  { label: 'Validating each fix', icon: ShieldCheck },
];

export interface AgentFixTarget {
  id: string;
  issue: string;
}

export interface AgentFixResult {
  id: string;
  implementationSnippet?: string;
  notApplicable?: boolean;
  error?: string;
}

type ItemStatus = 'queued' | 'processing' | 'done' | 'skipped' | 'error';

export default function AgentFixModal({
  scanId,
  targets,
  onClose,
  onComplete,
}: {
  scanId: string;
  targets: AgentFixTarget[];
  onClose: () => void;
  onComplete: (results: AgentFixResult[]) => void;
}) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [itemStatus, setItemStatus] = useState<Record<string, ItemStatus>>(() =>
    Object.fromEntries(targets.map((t) => [t.id, 'queued' as ItemStatus]))
  );
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Simulated phase/item progression, purely visual — the real status of
    // each suggestion (done/skipped/error) is only ever set from the actual
    // API response below, never invented by these timers.
    const phaseTimers = [
      setTimeout(() => setPhaseIndex(1), 700),
      setTimeout(() => setPhaseIndex(2), 1600),
      setTimeout(() => setPhaseIndex(3), Math.max(2600, targets.length * 500)),
    ];
    const itemTimers = targets.map((t, i) =>
      setTimeout(() => {
        setItemStatus((prev) => (prev[t.id] === 'queued' ? { ...prev, [t.id]: 'processing' } : prev));
      }, 500 + i * 450)
    );

    fetch(`/api/audit/${scanId}/snippets`, { method: 'POST' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `${AGENT_NAME} couldn't generate these fixes.`);
        const results = json.results as AgentFixResult[];

        setItemStatus((prev) => {
          const next = { ...prev };
          for (const r of results) {
            next[r.id] = r.notApplicable ? 'skipped' : r.error ? 'error' : 'done';
          }
          return next;
        });
        setPhaseIndex(AGENT_PHASES.length);
        setFinished(true);
        onComplete(results);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : `${AGENT_NAME} ran into a problem generating these fixes.`);
      })
      .finally(() => {
        phaseTimers.forEach(clearTimeout);
        itemTimers.forEach(clearTimeout);
      });

    return () => {
      phaseTimers.forEach(clearTimeout);
      itemTimers.forEach(clearTimeout);
    };
    // Runs exactly once on mount (guarded by startedRef); onComplete/onClose/
    // scanId/targets are all stable for the lifetime of this modal instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in-up">
      <div className="w-full max-w-lg glass-panel rounded-2xl p-6 md:p-7 shadow-2xl shadow-black/50 animate-scale-in relative">
        {(finished || error) && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Persona */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-900/40">
            {!finished && !error && <span className="absolute inset-0 rounded-xl bg-emerald-400/30 animate-pulse-ring" />}
            <Bot className="h-5 w-5 text-white relative" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">{AGENT_NAME}</p>
            <p className="text-xs text-slate-400">Implementation Agent</p>
          </div>
        </div>

        {error ? (
          <div className="text-sm text-rose-400 bg-rose-950/30 border border-rose-500/20 rounded-lg p-3">{error}</div>
        ) : (
          <>
            {/* Phase stepper */}
            <div className="space-y-2 mb-6">
              {AGENT_PHASES.map((phase, idx) => {
                const Icon = phase.icon;
                const isDone = idx < phaseIndex;
                const isActive = idx === phaseIndex;
                return (
                  <div
                    key={phase.label}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors duration-500 ${
                      isActive ? 'border-emerald-500/40 bg-emerald-950/30' : isDone ? 'border-emerald-800/30 bg-emerald-950/10' : 'border-white/5 bg-white/[0.02]'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-emerald-300' : 'text-slate-600'}`} />
                    )}
                    <span className={`text-xs font-mono ${isActive ? 'text-emerald-200' : isDone ? 'text-emerald-400/70' : 'text-slate-600'}`}>{phase.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Per-suggestion checklist — real suggestion text; status only ever comes from the real API response */}
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {targets.map((t) => {
                const status = itemStatus[t.id];
                return (
                  <div key={t.id} className="flex items-center gap-2.5 text-xs py-1">
                    {status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                    {status === 'skipped' && <MinusCircle className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
                    {status === 'error' && <X className="h-3.5 w-3.5 text-rose-400 shrink-0" />}
                    {status === 'processing' && <Loader2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 animate-spin" />}
                    {status === 'queued' && <span className="h-3.5 w-3.5 rounded-full border border-slate-700 shrink-0" />}
                    <span className={`truncate ${status === 'queued' ? 'text-slate-600' : 'text-slate-300'}`}>{t.issue}</span>
                  </div>
                );
              })}
            </div>

            {finished && (
              <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {AGENT_NAME} is done.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs text-white bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg transition-colors"
                >
                  View Results
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
