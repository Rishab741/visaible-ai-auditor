'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Copy, Check, Code2, MinusCircle } from 'lucide-react';
import type { Suggestion } from './AuditReport';

const SEVERITY_STYLES: Record<Suggestion['severity'], string> = {
  HIGH: 'bg-red-950/70 text-red-400 border border-red-800/70',
  MEDIUM: 'bg-amber-950/70 text-amber-400 border border-amber-800/70',
  LOW: 'bg-blue-950/70 text-blue-400 border border-blue-800/70',
};

export default function SuggestionCard({
  item,
  isOpen,
  isNotApplicable,
  copiedId,
  onToggleOpen,
  onCopy,
  animationDelay,
}: {
  item: Suggestion;
  isOpen: boolean;
  isNotApplicable: boolean;
  copiedId: string | null;
  onToggleOpen: () => void;
  onCopy: (text: string, id: string) => void;
  animationDelay: string;
}) {
  // Suggested Fix and Implementation Snippet cover the same ground (one is
  // prose, one is code) — showing both at once is what made cards balloon
  // once Arthur generated snippets for everything. A tab keeps only one
  // visible, and auto-switches to the snippet the moment it becomes real.
  const [tab, setTab] = useState<'fix' | 'snippet'>('fix');
  const hadSnippetRef = useRef(!!item.implementationSnippet);

  useEffect(() => {
    if (item.implementationSnippet && !hadSnippetRef.current) {
      hadSnippetRef.current = true;
      setTab('snippet');
    }
  }, [item.implementationSnippet]);

  const affectedUrls: string[] = (() => {
    try {
      return JSON.parse(item.affectedUrls);
    } catch {
      return [item.affectedUrls];
    }
  })();

  const showingSnippet = tab === 'snippet' && !!item.implementationSnippet;
  const copyId = showingSnippet ? `${item.id}-snippet` : item.id;
  const copyText = showingSnippet ? item.implementationSnippet! : item.suggestedFix;

  return (
    <div
      className="glass-panel rounded-2xl overflow-hidden hover:border-white/20 hover:shadow-lg hover:shadow-black/20 transition-all animate-fade-in-up"
      style={{ animationDelay }}
    >
      <button type="button" onClick={onToggleOpen} className="w-full text-left p-5 cursor-pointer">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold uppercase ${SEVERITY_STYLES[item.severity]}`}>{item.severity}</span>
            <span className="text-xs font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded">{item.category.replace('_', ' ')}</span>
            {item.implementationSnippet && (
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase bg-emerald-950/70 text-emerald-400 border border-emerald-800/70 flex items-center gap-1">
                <Code2 className="h-2.5 w-2.5" /> Fix Ready
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-slate-500">{(item.confidenceScore * 100).toFixed(0)}%</span>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>

        <h4 className="text-sm font-semibold text-slate-100 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          {item.issue}
        </h4>
      </button>

      <div className={`accordion-rows ${isOpen ? 'is-open' : ''}`}>
        <div className="accordion-inner">
          <div className="space-y-3 px-5 pb-5 pt-1 text-sm">
            <div className="bg-slate-950/50 p-3.5 rounded-lg border border-white/5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Why this degrades AI Engine Visibility</p>
              <p className="text-slate-300 leading-relaxed">{item.impactReason}</p>
            </div>

            <div className="bg-indigo-950/30 rounded-lg border border-indigo-500/20 overflow-hidden">
              <div className="flex items-center justify-between px-3.5 pt-3 gap-2">
                {item.implementationSnippet ? (
                  <div className="flex items-center gap-1 bg-black/20 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setTab('fix')}
                      className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md transition-colors ${
                        tab === 'fix' ? 'bg-indigo-600 text-white' : 'text-indigo-300 hover:text-white'
                      }`}
                    >
                      Fix
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('snippet')}
                      className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                        tab === 'snippet' ? 'bg-emerald-600 text-white' : 'text-emerald-300 hover:text-white'
                      }`}
                    >
                      <Code2 className="h-3 w-3" /> Snippet
                    </button>
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Actionable Optimization Fix</p>
                )}
                <button
                  onClick={() => onCopy(copyText, copyId)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono transition-colors shrink-0"
                >
                  {copiedId === copyId ? (
                    <>
                      <Check className="h-3 w-3" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Copy
                    </>
                  )}
                </button>
              </div>
              <pre
                className={`text-xs font-mono whitespace-pre-wrap leading-relaxed p-3.5 pt-2 overflow-x-auto ${
                  showingSnippet ? 'text-emerald-100/90' : 'text-slate-200'
                }`}
              >
                {copyText}
              </pre>
            </div>

            {isNotApplicable && !item.implementationSnippet && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-white/[0.03] border border-dashed border-white/10 rounded-lg p-3">
                <MinusCircle className="h-3.5 w-3.5 shrink-0" />
                This fix isn&apos;t the kind of thing that reduces to a pasteable snippet.
              </div>
            )}

            {affectedUrls.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-slate-500">Origin:</span>
                {affectedUrls.map((u, i) => (
                  <span key={i} className="text-xs text-slate-400 font-mono bg-white/5 px-2 py-0.5 rounded">
                    {u}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
