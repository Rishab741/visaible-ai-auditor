'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, Check, Code2, MinusCircle, ShieldCheck, Sparkles } from 'lucide-react';
import type { Suggestion } from './AuditReport';
import {
  parseAffectedUrls,
  getActionability,
  CATEGORY_LABELS,
  ACTIONABILITY_LABELS,
  ACTIONABILITY_DESCRIPTIONS,
  SEVERITY_LABELS,
  SEVERITY_DESCRIPTIONS,
} from './suggestionUtils';

const SEVERITY_CHIP_STYLES: Record<Suggestion['severity'], string> = {
  HIGH: 'bg-rose-50 text-rose-700 border-rose-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
};

const ACTIONABILITY_CHIP_STYLES = {
  diy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  developer: 'bg-indigo-50 text-indigo-700 border-indigo-200',
} as const;

export default function SuggestionCard({
  item,
  isOpen,
  isNotApplicable,
  copiedId,
  onToggleOpen,
  onCopy,
  animationDelay,
  pageTypeByUrl,
  pageTypeLabels,
  targetUrl,
}: {
  item: Suggestion;
  isOpen: boolean;
  isNotApplicable: boolean;
  copiedId: string | null;
  onToggleOpen: () => void;
  onCopy: (text: string, id: string) => void;
  animationDelay: string;
  pageTypeByUrl: Map<string, string>;
  pageTypeLabels: Record<string, string>;
  targetUrl: string;
}) {
  const actionability = getActionability(item.category);

  // Suggested Fix and Implementation Snippet cover the same ground (one is
  // prose, one is code). A "developer" fix auto-switches to the snippet the
  // moment it's generated, since that's the useful artifact for that
  // audience; a "diy" fix stays on the plain instructions even once a
  // snippet exists, since the plain text is the point for that reader.
  const [tab, setTab] = useState<'fix' | 'snippet'>('fix');
  const hadSnippetRef = useRef(!!item.implementationSnippet);

  useEffect(() => {
    if (item.implementationSnippet && !hadSnippetRef.current) {
      hadSnippetRef.current = true;
      setTab(actionability === 'developer' ? 'snippet' : 'fix');
    }
  }, [item.implementationSnippet, actionability]);

  const affectedUrls = parseAffectedUrls(item.affectedUrls);
  const relativePath = (u: string) => u.replace(targetUrl, '') || '/';

  const showingSnippet = tab === 'snippet' && !!item.implementationSnippet;
  const copyId = showingSnippet ? `${item.id}-snippet` : item.id;
  const copyText = showingSnippet ? item.implementationSnippet! : item.suggestedFix;
  const title = item.plainSummary || item.issue;

  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-fade-in-up"
      style={{ animationDelay }}
    >
      <button type="button" onClick={onToggleOpen} className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-slate-50/80 transition-colors">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span
              title={SEVERITY_DESCRIPTIONS[item.severity]}
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${SEVERITY_CHIP_STYLES[item.severity]}`}
            >
              {SEVERITY_LABELS[item.severity]}
            </span>
            <span
              title={ACTIONABILITY_DESCRIPTIONS[actionability]}
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${ACTIONABILITY_CHIP_STYLES[actionability]}`}
            >
              {ACTIONABILITY_LABELS[actionability]}
            </span>
            {item.implementationSnippet && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold border bg-cyan-50 text-cyan-700 border-cyan-200 flex items-center gap-1">
                <Code2 className="h-2.5 w-2.5" /> Fix ready
              </span>
            )}
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{CATEGORY_LABELS[item.category] ?? item.category}</span>
          </div>
          <p className="text-sm font-semibold text-slate-900 leading-snug">{title}</p>
          {affectedUrls.length > 0 && (
            <p className="text-xs text-slate-400 mt-1">{affectedUrls.length === 1 ? `On ${relativePath(affectedUrls[0])}` : `On ${affectedUrls.length} pages`}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {item.confidenceScore === 1 ? (
            <ShieldCheck className="h-4 w-4 text-slate-400" aria-label="Double-checked automatically" />
          ) : (
            <Sparkles className="h-4 w-4 text-slate-400" aria-label="Found by AI review" />
          )}
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <div className={`accordion-rows ${isOpen ? 'is-open' : ''}`}>
        <div className="accordion-inner">
          <div className="space-y-4 px-5 pb-5 pt-1 text-sm border-t border-slate-100">
            <div className="pt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Why it matters</p>
              <p className="text-slate-700 leading-relaxed">{item.impactReason}</p>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-3 gap-2">
                {item.implementationSnippet ? (
                  <div className="flex items-center gap-1 bg-slate-200/60 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setTab('fix')}
                      className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-md transition-colors ${
                        tab === 'fix' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      What to do
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('snippet')}
                      className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                        tab === 'snippet' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Code2 className="h-3 w-3" /> Code
                    </button>
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{actionability === 'diy' ? 'What to do' : 'Suggested fix'}</p>
                )}
                <button
                  onClick={() => onCopy(copyText, copyId)}
                  className="text-xs text-cyan-700 hover:text-cyan-800 flex items-center gap-1 font-medium transition-colors shrink-0"
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
              <pre className={`text-xs whitespace-pre-wrap leading-relaxed p-4 pt-2 overflow-x-auto ${showingSnippet ? 'font-mono text-slate-700' : 'font-sans text-slate-800'}`}>
                {copyText}
              </pre>
              {showingSnippet && (
                <p className="text-[11px] text-slate-500 px-4 pb-3 -mt-1">Share this with whoever manages your website&apos;s code.</p>
              )}
            </div>

            {isNotApplicable && !item.implementationSnippet && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-lg p-3">
                <MinusCircle className="h-3.5 w-3.5 shrink-0" />
                This fix isn&apos;t the kind of thing that reduces to a pasteable snippet.
              </div>
            )}

            {affectedUrls.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-slate-400">Where:</span>
                {affectedUrls.map((u, i) => {
                  const type = pageTypeByUrl.get(u);
                  return (
                    <span key={i} className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1.5">
                      {relativePath(u)}
                      {type && <span className="text-[10px] text-cyan-700 uppercase tracking-wide">{pageTypeLabels[type] ?? type}</span>}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
