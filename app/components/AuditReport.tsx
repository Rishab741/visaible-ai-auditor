'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  AlertTriangle,
  ExternalLink,
  Layers,
  FileText,
  Copy,
  Check,
  Building2,
  ShieldCheck,
  History,
  RefreshCw,
  Code2,
  ChevronDown,
  ClipboardList,
  Wand2,
  ArrowLeft,
  LayoutDashboard,
  MinusCircle,
  Bot,
} from 'lucide-react';
import AgentFixModal, { AGENT_NAME, type AgentFixResult } from './AgentFixModal';

export interface Suggestion {
  id: string;
  category: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  impactReason: string;
  suggestedFix: string;
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
  ROOMS: 'Rooms',
  AMENITIES: 'Amenities',
  DINING: 'Dining',
  LOCATION: 'Location',
  POLICIES: 'Policies',
  GENERAL: 'Other Pages',
};

const SEVERITY_STYLES: Record<Suggestion['severity'], string> = {
  HIGH: 'bg-red-950/70 text-red-400 border border-red-800/70',
  MEDIUM: 'bg-amber-950/70 text-amber-400 border border-amber-800/70',
  LOW: 'bg-blue-950/70 text-blue-400 border border-blue-800/70',
};

const CATEGORIES = [
  { key: 'ALL', label: 'All Issues' },
  { key: 'CONTENT_CLARITY', label: 'Content Clarity' },
  { key: 'INTERNAL_CONSISTENCY', label: 'Cross-Page Consistency' },
  { key: 'STRUCTURED_DATA', label: 'Schema & Structured Data' },
  { key: 'PAGE_COVERAGE', label: 'Coverage & Gaps' },
  { key: 'STRUCTURAL_SIGNALS', label: 'Structural Extraction' },
];

function scoreBarClass(score: number): string {
  return score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
}

function scoreStrokeColor(score: number): string {
  return score >= 75 ? '#34d399' : score >= 50 ? '#fbbf24' : '#fb7185';
}

function buildReportMarkdown(data: AuditScanResult): string {
  const lines: string[] = [];
  lines.push(`# AI Visibility Audit — ${data.hotelName || 'Hotel Property'}`);
  lines.push(`${data.targetUrl}`);
  lines.push('');
  lines.push(`**Overall AI Readability Score:** ${data.overallScore}/100`);
  if (data.categoryScores) {
    lines.push('');
    lines.push('**Score Breakdown:**');
    for (const [key, score] of Object.entries(data.categoryScores)) {
      lines.push(`- ${key.replace(/_/g, ' ')}: ${score}/100`);
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
    lines.push(`### [${s.severity}] ${s.category.replace(/_/g, ' ')}: ${s.issue}`);
    lines.push(`**Why it matters:** ${s.impactReason}`);
    lines.push('');
    lines.push(`**Fix:** ${s.suggestedFix}`);
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
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-slate-800" />
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
          style={{ filter: `drop-shadow(0 0 6px ${scoreStrokeColor(score)}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-white tabular-nums">{displayScore}</span>
        <span className="text-[10px] text-slate-500 -mt-0.5">/ 100</span>
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
        <span className="text-slate-300">{label}</span>
        <span className="font-mono text-slate-400 tabular-nums">{displayScore}/100</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800/80 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-out ${scoreBarClass(score)}`}
          style={{ width: `${widthPct}%`, transitionDelay: `${delayMs}ms` }}
        />
      </div>
    </div>
  );
}

export default function AuditReport({ data, onRefresh, refreshing }: { data: AuditScanResult; onRefresh: () => void; refreshing: boolean }) {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
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

  const pagesCount = useCountUp(data.pages.length, revealed, 900);

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

  const filteredSuggestions = suggestions
    .filter((s) => (selectedCategory === 'ALL' ? true : s.category === selectedCategory))
    .slice()
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const groupedSuggestions: Array<{ key: string; label: string; items: Suggestion[] }> =
    selectedCategory === 'ALL'
      ? CATEGORIES.filter((c) => c.key !== 'ALL' && categoryCounts[c.key] > 0).map((c) => ({
          key: c.key,
          label: c.label,
          items: filteredSuggestions.filter((s) => s.category === c.key),
        }))
      : [{ key: selectedCategory, label: CATEGORIES.find((c) => c.key === selectedCategory)?.label ?? '', items: filteredSuggestions }];

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

  return (
    <section ref={resultsRef} className="max-w-6xl mx-auto space-y-8 scroll-mt-6">
      {/* Nav */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Search
        </Link>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <LayoutDashboard className="h-4 w-4" /> Dashboard
        </Link>
      </div>

      {/* Executive Scorecard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in-up">
        <div className="glass-panel p-6 rounded-2xl flex items-center justify-between hover:-translate-y-0.5 transition-transform">
          <div className="min-w-0">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Property</p>
            <h2 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-400 shrink-0" />
              <span className="truncate">{data.hotelName || 'Hotel Property'}</span>
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <a
                href={data.targetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-500 hover:text-slate-400 inline-flex items-center gap-1 truncate transition-colors"
              >
                <span className="truncate">{data.targetUrl}</span> <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
              {data.fromCache && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded shrink-0">
                  <History className="h-2.5 w-2.5" /> cached
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Run fresh audit
            </button>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex items-center justify-between hover:-translate-y-0.5 transition-transform">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Pages Ingested</p>
            <p className="text-3xl font-black text-white mt-1 tabular-nums">{pagesCount}</p>
            <p className="text-xs text-slate-500 mt-1">Multi-page fact extraction</p>
          </div>
          <Layers className="h-8 w-8 text-slate-700" />
        </div>

        <div className={`glass-panel p-6 rounded-2xl flex items-center justify-between hover:-translate-y-0.5 transition-transform ${revealed ? 'animate-glow-pulse' : ''}`}>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">AI Readability Score</p>
            <p className="text-xs text-slate-500 mt-1">Deterministically computed</p>
          </div>
          <ScoreGauge score={data.overallScore} revealed={revealed} />
        </div>
      </div>

      {/* Executive Summary */}
      {data.summary && (
        <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-5 flex items-start gap-3 animate-fade-in-up backdrop-blur-sm" style={{ animationDelay: '60ms' }}>
          <Sparkles className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">Executive Summary</p>
            <p className="text-sm text-slate-300 leading-relaxed">{data.summary}</p>
          </div>
        </div>
      )}

      {/* Deterministic Category Score Breakdown */}
      {data.categoryScores && (
        <div className="glass-panel p-4 rounded-2xl animate-fade-in-up" style={{ animationDelay: '75ms' }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-400" /> Score Breakdown
          </h3>
          <p className="text-[11px] text-slate-500 mb-4">
            Computed deterministically from crawled schema, page coverage, structure, and cross-page facts — not model-generated, so re-running an audit reproduces the same scores.
          </p>
          <div className="space-y-3">
            {CATEGORIES.filter((c) => c.key !== 'ALL').map((cat, idx) => (
              <CategoryScoreBar key={cat.key} label={cat.label} score={data.categoryScores?.[cat.key] ?? 0} revealed={revealed} delayMs={idx * 90} />
            ))}
          </div>
        </div>
      )}

      {/* Crawled Pages, grouped by type */}
      <div className="glass-panel p-4 rounded-2xl animate-fade-in-up" style={{ animationDelay: '90ms' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-400" /> Analyzed Pages ({data.pages.length})
        </h3>
        <div className="space-y-3">
          {pagesByType.map((group) => (
            <div key={group.type}>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                {group.label} <span className="text-slate-600">({group.pages.length})</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {group.pages.map((p) => (
                  <span key={p.id} className="bg-white/5 text-slate-300 text-xs px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1.5 font-mono" title={p.url}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {p.url.replace(data.targetUrl, '') || '/'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Generate Implementation Fixes — the one main agentic action, not a per-card trigger */}
      <div
        className="glass-panel rounded-2xl p-5 md:p-6 border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 to-teal-950/10 animate-fade-in-up"
        style={{ animationDelay: '105ms' }}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-900/30">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Generate Implementation Fixes</h3>
              <p className="text-xs text-slate-400 mt-0.5 max-w-md">
                {AGENT_NAME}, your implementation agent, turns every applicable suggestion into a ready-to-paste code snippet, grounded in the actual crawled content — one action for the whole report.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAgentModal(true)}
            disabled={pendingCount === 0}
            className="shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-900/30"
          >
            {pendingCount === 0 ? (
              <>
                <Check className="h-4 w-4" /> All Fixes Generated
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" /> Generate {pendingCount} Implementation Fix{pendingCount === 1 ? '' : 'es'}
              </>
            )}
          </button>
        </div>
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

      {/* Severity Breakdown + Category Filter Pills + Export */}
      <div className="space-y-3 pt-2 border-t border-white/10 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
              <span key={sev} className={`text-xs px-2.5 py-1 rounded-full font-mono font-semibold ${SEVERITY_STYLES[sev]}`}>
                {severityCounts[sev]} {sev}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard(buildReportMarkdown({ ...data, suggestions }), 'full-report')}
            className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
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
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === cat.key
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-900/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
              }`}
            >
              {cat.label}
              {cat.key !== 'ALL' && <span className="ml-1.5 opacity-60">{categoryCounts[cat.key] || 0}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Suggestion Cards, grouped by category, individually collapsible */}
      <div className="space-y-8">
        {filteredSuggestions.length === 0 ? (
          <div className="glass-panel p-8 text-center rounded-2xl text-slate-500">No issues detected under this category.</div>
        ) : (
          groupedSuggestions.map((group) => (
            <div key={group.key} className="space-y-4">
              {selectedCategory === 'ALL' && (
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  {group.label}
                  <span className="text-xs font-mono text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{group.items.length}</span>
                </h3>
              )}
              {group.items.map((item, idx) => {
                const affectedUrls: string[] = (() => {
                  try {
                    return JSON.parse(item.affectedUrls);
                  } catch {
                    return [item.affectedUrls];
                  }
                })();
                const isOpen = !collapsedIds.has(item.id);
                const isNotApplicable = notApplicableIds.has(item.id);

                return (
                  <div
                    key={item.id}
                    className="glass-panel rounded-2xl overflow-hidden hover:border-white/20 hover:shadow-lg hover:shadow-black/20 transition-all animate-fade-in-up"
                    style={{ animationDelay: `${Math.min(idx, 8) * 45}ms` }}
                  >
                    <button type="button" onClick={() => toggleCollapsed(item.id)} className="w-full text-left p-6 pb-0 cursor-pointer">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold uppercase ${SEVERITY_STYLES[item.severity]}`}>{item.severity} Severity</span>
                          <span className="text-xs font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded">{item.category.replace('_', ' ')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500">Confidence: {(item.confidenceScore * 100).toFixed(0)}%</span>
                          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      <h4 className="text-base font-semibold text-slate-100 flex items-start gap-2 mb-2 pb-6">
                        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        {item.issue}
                      </h4>
                    </button>

                    <div className={`accordion-rows ${isOpen ? 'is-open' : ''}`}>
                      <div className="accordion-inner">
                        <div className="space-y-3 px-6 pb-6 text-sm">
                          <div className="bg-slate-950/50 p-3.5 rounded-lg border border-white/5">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Why this degrades AI Engine Visibility:</p>
                            <p className="text-slate-300 leading-relaxed">{item.impactReason}</p>
                          </div>

                          <div className="bg-indigo-950/30 p-3.5 rounded-lg border border-indigo-500/20">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Actionable Optimization Fix:</p>
                              <button onClick={() => copyToClipboard(item.suggestedFix, item.id)} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono transition-colors">
                                {copiedId === item.id ? (
                                  <>
                                    <Check className="h-3 w-3" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" /> Copy Fix
                                  </>
                                )}
                              </button>
                            </div>
                            <pre className="text-slate-200 text-xs font-mono whitespace-pre-wrap leading-relaxed mt-1">{item.suggestedFix}</pre>
                          </div>

                          {/* Implementation Snippet — populated by the report-level "Generate Implementation Fixes" action */}
                          {item.implementationSnippet && (
                            <div className="bg-slate-950/50 p-3.5 rounded-lg border border-white/5">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                                  <Code2 className="h-3 w-3" /> Implementation Snippet
                                </p>
                                <button
                                  onClick={() => copyToClipboard(item.implementationSnippet!, `${item.id}-snippet`)}
                                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono transition-colors"
                                >
                                  {copiedId === `${item.id}-snippet` ? (
                                    <>
                                      <Check className="h-3 w-3" /> Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3" /> Copy Snippet
                                    </>
                                  )}
                                </button>
                              </div>
                              <pre className="text-emerald-100/90 text-xs font-mono whitespace-pre-wrap leading-relaxed mt-1 overflow-x-auto">{item.implementationSnippet}</pre>
                            </div>
                          )}
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
              })}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
