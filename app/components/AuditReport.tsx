'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ExternalLink,
  Check,
  Building2,
  History,
  RefreshCw,
  ClipboardList,
  Wand2,
  ArrowLeft,
  Bot,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  FilterX,
  Target,
  SlidersHorizontal,
} from 'lucide-react';
import AgentFixModal, { AGENT_NAME, type AgentFixResult } from './AgentFixModal';
import SuggestionCard from './SuggestionCard';
import {
  parseAffectedUrls,
  getActionability,
  pickTopPriorities,
  scoreInterpretation,
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  SEVERITY_LABELS,
  SEVERITY_DESCRIPTIONS,
  ACTIONABILITY_LABELS,
} from './suggestionUtils';

export interface Suggestion {
  id: string;
  category: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  impactReason: string;
  suggestedFix: string;
  plainSummary: string | null;
  implementationSnippet?: string | null;
  affectedUrls: string;
  currentSnippet?: string | null;
  confidenceScore: number;
}

export interface ScannedPage {
  id: string;
  url: string;
  title: string;
  pageType: string;
}

export interface AuditScanResult {
  id: string;
  targetUrl: string;
  hotelName: string | null;
  summary: string | null;
  overallScore: number;
  categoryScores: Record<string, number> | null;
  status: string;
  detectedCms?: string | null;
  pages: ScannedPage[];
  suggestions: Suggestion[];
  fromCache?: boolean;
}

const SEVERITY_ORDER: Record<Suggestion['severity'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const PAGE_TYPE_LABELS: Record<string, string> = {
  HOMEPAGE: 'Homepage',
  OFFERINGS: 'Offerings',
  ABOUT: 'About',
  LOCATION: 'Location',
  POLICIES: 'Policies',
  CONTACT: 'Contact',
  GENERAL: 'Other Pages',
};

function scoreBarClass(score: number): string {
  return score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
}

function scoreStrokeColor(score: number): string {
  return score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#f43f5e';
}

function buildReportMarkdown(data: AuditScanResult): string {
  const lines: string[] = [];
  lines.push(`# AI Visibility Audit — ${data.hotelName || 'Local Business'}`);
  lines.push(`${data.targetUrl}`);
  lines.push('');
  lines.push(`**Overall AI Readability Score:** ${data.overallScore}/100 — ${scoreInterpretation(data.overallScore)}`);
  if (data.categoryScores) {
    lines.push('');
    lines.push('**Score Breakdown:**');
    for (const key of CATEGORY_KEYS) {
      if (data.categoryScores[key] === undefined) continue;
      lines.push(`- ${CATEGORY_LABELS[key] ?? key}: ${data.categoryScores[key]}/100`);
    }
  }
  if (data.summary) {
    lines.push('');
    lines.push(`**Executive Summary:** ${data.summary}`);
  }
  lines.push('');
  lines.push(`**Pages Analyzed:** ${data.pages.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Suggestions');
  for (const s of data.suggestions) {
    lines.push('');
    lines.push(`### [${SEVERITY_LABELS[s.severity]}] ${CATEGORY_LABELS[s.category] ?? s.category}: ${s.plainSummary || s.issue}`);
    lines.push(`**Why it matters:** ${s.impactReason}`);
    lines.push('');
    lines.push(`**Fix (${ACTIONABILITY_LABELS[getActionability(s.category)]}):** ${s.suggestedFix}`);
    if (s.implementationSnippet) {
      lines.push('');
      lines.push('```');
      lines.push(s.implementationSnippet);
      lines.push('```');
    }
  }
  return lines.join('\n');
}

function useCountUp(target: number, active: boolean, durationMs = 1200): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durationMs]);

  return active ? value : 0;
}

function ScoreGauge({ score, revealed, size = 108 }: { score: number; revealed: boolean; size?: number }) {
  const displayScore = useCountUp(score, revealed, 1400);
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = revealed ? score : 0;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-slate-100" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={scoreStrokeColor(score)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="gauge-ring"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-slate-900 tabular-nums">{displayScore}</span>
        <span className="text-[10px] text-slate-400 -mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

function CategoryScoreBar({ label, score, revealed, delayMs }: { label: string; score: number; revealed: boolean; delayMs: number }) {
  const displayScore = useCountUp(score, revealed, 1000);
  const widthPct = revealed ? score : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-500 tabular-nums">{displayScore}/100</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-out ${scoreBarClass(score)}`}
          style={{ width: `${widthPct}%`, transitionDelay: `${delayMs}ms` }}
        />
      </div>
    </div>
  );
}

function TopPriorityCard({ item, rank, targetUrl, onView }: { item: Suggestion; rank: number; targetUrl: string; onView: () => void }) {
  const actionability = getActionability(item.category);
  const affectedUrls = parseAffectedUrls(item.affectedUrls);
  const relativePath = (u: string) => u.replace(targetUrl, '') || '/';

  return (
    <button
      type="button"
      onClick={onView}
      className="w-full flex items-start gap-3 bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-cyan-300 hover:shadow-sm transition-all"
    >
      <span className="shrink-0 h-6 w-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center mt-0.5">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${
              actionability === 'diy' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}
          >
            {ACTIONABILITY_LABELS[actionability]}
          </span>
          {affectedUrls.length > 0 && (
            <span className="text-[11px] text-slate-400">{affectedUrls.length === 1 ? `on ${relativePath(affectedUrls[0])}` : `on ${affectedUrls.length} pages`}</span>
          )}
        </div>
        <p className="text-sm font-semibold text-slate-900 leading-snug">{item.plainSummary || item.issue}</p>
      </div>
    </button>
  );
}

const ALL_SEVERITIES: Suggestion['severity'][] = ['HIGH', 'MEDIUM', 'LOW'];

export default function AuditReport({ data, onRefresh, refreshing }: { data: AuditScanResult; onRefresh: () => void; refreshing: boolean }) {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [activeSeverities, setActiveSeverities] = useState<Set<Suggestion['severity']>>(new Set(ALL_SEVERITIES));
  const [selectedPageUrl, setSelectedPageUrl] = useState('ALL');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Cards default collapsed — a report with a dozen fully-expanded cards
  // (each showing why/fix/snippet/origin) reads as an unscannable wall of
  // text, especially once Arthur has filled in every snippet.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set(data.suggestions.map((s) => s.id)));
  const [suggestions, setSuggestions] = useState(data.suggestions);
  const [revealed, setRevealed] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // The one main "act on this" action for the whole report, instead of a
  // per-card trigger — generates every applicable snippet in one go, run by
  // Arthur (AgentFixModal) rather than an inline spinner on the button.
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [notApplicableIds, setNotApplicableIds] = useState<Set<string>>(new Set());

  // AuditReport only ever mounts fresh for a given scan (each /audit/[id]
  // navigation is a new page, so a new mount) — no need to sync `suggestions`
  // to `data` on every render; the useState initializer above already
  // captures it correctly. This effect just handles the mount-time reveal.
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 50);
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return () => clearTimeout(t);
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setCollapsedIds(new Set());
  const collapseAll = () => setCollapsedIds(new Set(suggestions.map((s) => s.id)));
  const allExpanded = collapsedIds.size === 0;

  const toggleSeverity = (sev: Suggestion['severity']) => {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };

  const isFiltered = selectedCategory !== 'ALL' || activeSeverities.size < 3 || selectedPageUrl !== 'ALL';
  const clearFilters = () => {
    setSelectedCategory('ALL');
    setActiveSeverities(new Set(ALL_SEVERITIES));
    setSelectedPageUrl('ALL');
  };

  // Jumps from the Top Priorities panel down to the real card in the full
  // list below, resetting any filter that would otherwise hide it and
  // expanding it — a shortcut into the familiar detail view rather than a
  // second copy of the fix content.
  const jumpToSuggestion = (id: string) => {
    clearFilters();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setTimeout(() => {
      document.getElementById(`suggestion-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const pendingTargets = suggestions
    .filter((s) => !s.implementationSnippet && !notApplicableIds.has(s.id))
    .map((s) => ({ id: s.id, issue: s.issue }));
  const pendingCount = pendingTargets.length;

  const handleAgentComplete = (results: AgentFixResult[]) => {
    const resultsById = new Map(results.map((r) => [r.id, r]));

    setSuggestions((prev) =>
      prev.map((s) => {
        const result = resultsById.get(s.id);
        return result?.implementationSnippet ? { ...s, implementationSnippet: result.implementationSnippet } : s;
      })
    );
    setNotApplicableIds((prev) => {
      const next = new Set(prev);
      for (const r of results) {
        if (r.notApplicable) next.add(r.id);
      }
      return next;
    });
  };

  const categoryCounts: Record<string, number> = {};
  const severityCounts: Record<Suggestion['severity'], number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const s of suggestions) {
    categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
    severityCounts[s.severity] += 1;
  }

  const topPriorities = pickTopPriorities(suggestions, 3);

  const filteredSuggestions = suggestions
    .filter((s) => (selectedCategory === 'ALL' ? true : s.category === selectedCategory))
    .filter((s) => activeSeverities.has(s.severity))
    .filter((s) => (selectedPageUrl === 'ALL' ? true : parseAffectedUrls(s.affectedUrls).includes(selectedPageUrl)))
    .slice()
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const groupedSuggestions: Array<{ key: string; label: string; items: Suggestion[] }> =
    selectedCategory === 'ALL'
      ? CATEGORY_KEYS.filter((key) => categoryCounts[key] > 0).map((key) => ({
          key,
          label: CATEGORY_LABELS[key],
          items: filteredSuggestions.filter((s) => s.category === key),
        }))
      : [{ key: selectedCategory, label: CATEGORY_LABELS[selectedCategory] ?? selectedCategory, items: filteredSuggestions }];

  const pagesByType: Array<{ type: string; label: string; pages: ScannedPage[] }> = [];
  const grouped = new Map<string, ScannedPage[]>();
  for (const p of data.pages) {
    const list = grouped.get(p.pageType) ?? [];
    list.push(p);
    grouped.set(p.pageType, list);
  }
  for (const [type, pages] of grouped) {
    pagesByType.push({ type, label: PAGE_TYPE_LABELS[type] ?? type, pages });
  }
  pagesByType.sort((a, b) => a.label.localeCompare(b.label));

  // Lets each row's Origin chips show a page's category (Offerings, Location,
  // ...) alongside its URL without a lookup.
  const pageTypeByUrl = new Map(data.pages.map((p) => [p.url, p.pageType]));
  const pageFilterOptions = data.pages
    .slice()
    .sort((a, b) => a.url.localeCompare(b.url))
    .map((p) => ({
      url: p.url,
      label: `${p.url.replace(data.targetUrl, '') || '/'} · ${PAGE_TYPE_LABELS[p.pageType] ?? p.pageType}`,
    }));

  return (
    <section ref={resultsRef} className="max-w-5xl mx-auto space-y-6 scroll-mt-6">
      {/* Nav */}
      <div className="animate-fade-in-up">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Search
        </Link>
      </div>

      {/* Report cover: business identity + score + plain-language read */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm animate-fade-in-up">
        <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
          <ScoreGauge score={data.overallScore} revealed={revealed} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-cyan-700 uppercase tracking-wide mb-1">AI Visibility Report</p>
            <h1 className="text-2xl font-bold text-slate-900 truncate flex items-center gap-2">
              <Building2 className="h-5 w-5 text-slate-400 shrink-0" />
              <span className="truncate">{data.hotelName || 'Your Business'}</span>
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <a href={data.targetUrl} target="_blank" rel="noreferrer" className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1 truncate transition-colors">
                <span className="truncate">{data.targetUrl}</span> <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
              {data.fromCache && (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                  <History className="h-2.5 w-2.5" /> cached result
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">{scoreInterpretation(data.overallScore)}</p>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-cyan-700 hover:text-cyan-800 font-medium disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Run fresh audit
            </button>
          </div>
        </div>
      </div>

      {/* Executive Summary */}
      {data.summary && (
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-5 flex items-start gap-3 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
          <Sparkles className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1">The big picture</p>
            <p className="text-sm text-slate-700 leading-relaxed">{data.summary}</p>
          </div>
        </div>
      )}

      {/* Top priorities — a curated shortcut into the full list below, not a duplicate of it */}
      <div className="bg-gradient-to-br from-cyan-50 to-white border border-cyan-100 rounded-2xl p-5 md:p-6 animate-fade-in-up" style={{ animationDelay: '80ms' }}>
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-4 w-4 text-cyan-700" />
          <h2 className="text-sm font-bold text-slate-900">Start here</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">The highest-impact things to fix first.</p>
        {topPriorities.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing urgent — everything below is polish-level.</p>
        ) : (
          <div className="space-y-2.5">
            {topPriorities.map((item, i) => (
              <TopPriorityCard key={item.id} item={item} rank={i + 1} targetUrl={data.targetUrl} onView={() => jumpToSuggestion(item.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Score breakdown + pages we looked at, side by side to keep the top section compact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {data.categoryScores && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Score breakdown</h3>
            <div className="space-y-3">
              {CATEGORY_KEYS.map((key, idx) => (
                <div key={key} title={CATEGORY_DESCRIPTIONS[key]}>
                  <CategoryScoreBar label={CATEGORY_LABELS[key]} score={data.categoryScores?.[key] ?? 0} revealed={revealed} delayMs={idx * 90} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm animate-fade-in-up" style={{ animationDelay: '110ms' }}>
          <button type="button" onClick={() => setShowPages((v) => !v)} className="w-full flex items-center justify-between text-left">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pages we looked at ({data.pages.length})</h3>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showPages ? 'rotate-180' : ''}`} />
          </button>
          {showPages && (
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1 mt-3">
              {pagesByType.map((group) => (
                <div key={group.type}>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                    {group.label} <span className="text-slate-300">({group.pages.length})</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.pages.map((p) => (
                      <span key={p.id} className="bg-slate-50 text-slate-600 text-xs px-2.5 py-1 rounded-full border border-slate-200" title={p.url}>
                        {p.url.replace(data.targetUrl, '') || '/'}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Generate Implementation Fixes — the one main agentic action, not a per-card trigger */}
      <div
        className="bg-white border border-cyan-100 rounded-xl px-5 py-3.5 shadow-sm animate-fade-in-up flex items-center justify-between gap-4 flex-wrap"
        style={{ animationDelay: '120ms' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <p className="text-sm text-slate-600 truncate">
            <span className="font-semibold text-slate-900">{AGENT_NAME}</span> can draft ready-to-paste fixes — plain instructions for you, code for your developer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAgentModal(true)}
          disabled={pendingCount === 0}
          className="shrink-0 inline-flex items-center gap-2 text-sm font-bold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:bg-slate-300 px-4 py-2 rounded-lg transition-all"
        >
          {pendingCount === 0 ? (
            <>
              <Check className="h-4 w-4" /> All Fixes Generated
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" /> Generate {pendingCount} Fix{pendingCount === 1 ? '' : 'es'}
            </>
          )}
        </button>
      </div>

      {showAgentModal && (
        <AgentFixModal
          scanId={data.id}
          targets={pendingTargets}
          detectedCms={data.detectedCms ?? null}
          onComplete={handleAgentComplete}
          onClose={() => setShowAgentModal(false)}
        />
      )}

      {/* Filters: severity toggles, category pills, page filter + Export */}
      <div className="space-y-3 pt-2 border-t border-slate-200 animate-fade-in-up" style={{ animationDelay: '130ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {ALL_SEVERITIES.map((sev) => {
              const isActive = activeSeverities.has(sev);
              return (
                <button
                  key={sev}
                  type="button"
                  onClick={() => toggleSeverity(sev)}
                  title={SEVERITY_DESCRIPTIONS[sev]}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-opacity ${
                    sev === 'HIGH' ? 'bg-rose-50 text-rose-700 border-rose-200' : sev === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                  } ${isActive ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
                >
                  {severityCounts[sev]} {SEVERITY_LABELS[sev]}
                </button>
              );
            })}
            {isFiltered && (
              <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-800 transition-colors ml-1">
                <FilterX className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={allExpanded ? collapseAll : expandAll}
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              {allExpanded ? (
                <>
                  <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse All
                </>
              ) : (
                <>
                  <ChevronsUpDown className="h-3.5 w-3.5" /> Expand All
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(buildReportMarkdown({ ...data, suggestions }), 'full-report')}
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              {copiedId === 'full-report' ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Report Copied
                </>
              ) : (
                <>
                  <ClipboardList className="h-3.5 w-3.5" /> Copy Full Report
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Issues
            </button>
            {CATEGORY_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                title={CATEGORY_DESCRIPTIONS[key]}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedCategory === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {CATEGORY_LABELS[key]}
                <span className="ml-1.5 opacity-60">{categoryCounts[key] || 0}</span>
              </button>
            ))}
          </div>

          {pageFilterOptions.length > 1 && (
            <button
              type="button"
              onClick={() => setShowMoreFilters((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors shrink-0"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> More filters
            </button>
          )}
        </div>

        {showMoreFilters && pageFilterOptions.length > 1 && (
          <div className="flex justify-end">
            <select
              value={selectedPageUrl}
              onChange={(e) => setSelectedPageUrl(e.target.value)}
              title="Filter suggestions down to a single scanned page"
              className="bg-white border border-slate-200 text-slate-600 text-xs pl-3 pr-7 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer max-w-[240px]"
            >
              <option value="ALL">All Pages ({data.pages.length})</option>
              {pageFilterOptions.map((p) => (
                <option key={p.url} value={p.url}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Suggestions, grouped by category, rendered as cards */}
      <div className="space-y-8">
        {filteredSuggestions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            No issues match the current filters.
            {isFiltered && (
              <button type="button" onClick={clearFilters} className="block mx-auto mt-2 text-xs text-cyan-700 hover:text-cyan-800">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          groupedSuggestions.map((group) => (
            <div key={group.key} className="space-y-3">
              {selectedCategory === 'ALL' && (
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  {group.label}
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{group.items.length}</span>
                </h3>
              )}
              <div className="space-y-2.5">
                {group.items.map((item, idx) => (
                  <div key={item.id} id={`suggestion-${item.id}`}>
                    <SuggestionCard
                      item={item}
                      isOpen={!collapsedIds.has(item.id)}
                      isNotApplicable={notApplicableIds.has(item.id)}
                      copiedId={copiedId}
                      onToggleOpen={() => toggleCollapsed(item.id)}
                      onCopy={copyToClipboard}
                      animationDelay={`${Math.min(idx, 8) * 45}ms`}
                      pageTypeByUrl={pageTypeByUrl}
                      pageTypeLabels={PAGE_TYPE_LABELS}
                      targetUrl={data.targetUrl}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
