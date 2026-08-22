'use client';

import React, { useState } from 'react';
import {
  Globe,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Layers,
  FileText,
  Copy,
  Check,
  Building2,
  ShieldCheck,
  Search,
  Compass,
  ScanSearch,
  BrainCircuit,
  ListChecks,
} from 'lucide-react';

interface Suggestion {
  id: string;
  category: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  impactReason: string;
  suggestedFix: string;
  affectedUrls: string;
  currentSnippet?: string | null;
  confidenceScore: number;
}

interface ScannedPage {
  id: string;
  url: string;
  title: string;
  pageType: string;
}

interface AuditScanResult {
  id: string;
  targetUrl: string;
  hotelName: string;
  summary: string | null;
  overallScore: number;
  categoryScores: Record<string, number> | null;
  status: string;
  pages: ScannedPage[];
  suggestions: Suggestion[];
}

const LOADING_STAGES = [
  { label: 'Discovering all pages & routes', icon: Compass },
  { label: 'Crawling & extracting content', icon: ScanSearch },
  { label: 'Cross-referencing facts across pages', icon: BrainCircuit },
  { label: 'Generating AI visibility suggestions', icon: ListChecks },
];

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
  HIGH: 'bg-red-950 text-red-400 border border-red-800',
  MEDIUM: 'bg-amber-950 text-amber-400 border border-amber-800',
  LOW: 'bg-blue-950 text-blue-400 border border-blue-800',
};

export default function Dashboard() {
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const [auditData, setAuditData] = useState<AuditScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const presets = [
    { name: 'The Fullerton Hotel Sydney', url: 'https://www.fullertonhotels.com/fullerton-hotel-sydney' },
    { name: 'Ace Hotel Sydney', url: 'https://acehotel.com/sydney' },
    { name: 'Crown Towers Sydney', url: 'https://www.crownhotels.com.au/sydney/crown-towers' },
  ];

  const handleStartAudit = async (targetUrl: string) => {
    if (!targetUrl) return;
    setLoading(true);
    setErrorMsg(null);
    setAuditData(null);
    setSelectedCategory('ALL');
    setActiveStage(0);

    // The audit is a single request/response, so these timers approximate
    // real pipeline phases (discovery -> crawl -> cross-reference -> generate)
    // to keep the loading state legible during a multi-page scan.
    const stageTimers = [
      setTimeout(() => setActiveStage(1), 6000),
      setTimeout(() => setActiveStage(2), 20000),
      setTimeout(() => setActiveStage(3), 32000),
    ];

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Audit failed');

      setAuditData(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred during analysis.';
      setErrorMsg(message);
    } finally {
      stageTimers.forEach(clearTimeout);
      setLoading(false);
      setActiveStage(0);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const categories = [
    { key: 'ALL', label: 'All Issues' },
    { key: 'CONTENT_CLARITY', label: 'Content Clarity' },
    { key: 'INTERNAL_CONSISTENCY', label: 'Cross-Page Consistency' },
    { key: 'STRUCTURED_DATA', label: 'Schema & Structured Data' },
    { key: 'PAGE_COVERAGE', label: 'Coverage & Gaps' },
    { key: 'STRUCTURAL_SIGNALS', label: 'Structural Extraction' },
  ];

  const categoryCounts: Record<string, number> = {};
  const severityCounts: Record<Suggestion['severity'], number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const s of auditData?.suggestions ?? []) {
    categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
    severityCounts[s.severity] += 1;
  }

  const filteredSuggestions = (auditData?.suggestions ?? [])
    .filter((s) => (selectedCategory === 'ALL' ? true : s.category === selectedCategory))
    .slice()
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // When viewing "All Issues", group into per-category sections so the list reads
  // as a structured report rather than one long undifferentiated feed.
  const groupedSuggestions: Array<{ key: string; label: string; items: Suggestion[] }> =
    selectedCategory === 'ALL'
      ? categories
          .filter((c) => c.key !== 'ALL' && categoryCounts[c.key] > 0)
          .map((c) => ({
            key: c.key,
            label: c.label,
            items: filteredSuggestions.filter((s) => s.category === c.key),
          }))
      : [{ key: selectedCategory, label: categories.find((c) => c.key === selectedCategory)?.label ?? '', items: filteredSuggestions }];

  const pagesByType: Array<{ type: string; label: string; pages: ScannedPage[] }> = [];
  if (auditData) {
    const grouped = new Map<string, ScannedPage[]>();
    for (const p of auditData.pages) {
      const list = grouped.get(p.pageType) ?? [];
      list.push(p);
      grouped.set(p.pageType, list);
    }
    for (const [type, pages] of grouped) {
      pagesByType.push({ type, label: PAGE_TYPE_LABELS[type] ?? type, pages });
    }
    pagesByType.sort((a, b) => a.label.localeCompare(b.label));
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-600 text-white font-mono text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              Pilot
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Visaible <span className="text-indigo-400">AI Visibility Auditor</span>
            </h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Evaluate and optimize how ChatGPT, Perplexity & Gemini extract, reason, and recommend hotel properties.
          </p>
        </div>
      </header>

      {/* Input Section */}
      <section className="max-w-6xl mx-auto mb-10">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleStartAudit(urlInput);
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
                disabled={loading}
                className="w-full bg-slate-950 border border-slate-700 text-white pl-12 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !urlInput.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Sparkles className="h-4 w-4 animate-spin" />
                  Auditing...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Run AI Audit
                </>
              )}
            </button>
          </form>

          {/* Quick Presets for Demo */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Demo Presets:</span>
            {presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  setUrlInput(preset.url);
                  handleStartAudit(preset.url);
                }}
                disabled={loading}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded border border-slate-700 transition"
              >
                {preset.name}
              </button>
            ))}
          </div>

          {/* Animated Stage Loader */}
          {loading && (
            <div className="mt-6 animate-fade-in-up">
              <div className="relative h-1 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-indigo-500/0 via-indigo-400 to-indigo-500/0 animate-progress-sweep" />
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {LOADING_STAGES.map((stage, idx) => {
                  const StageIcon = stage.icon;
                  const isDone = idx < activeStage;
                  const isActive = idx === activeStage;
                  return (
                    <div
                      key={stage.label}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors duration-500 ${
                        isActive
                          ? 'border-indigo-500/40 bg-indigo-950/40'
                          : isDone
                          ? 'border-emerald-800/50 bg-emerald-950/20'
                          : 'border-slate-800 bg-slate-950/40'
                      }`}
                    >
                      <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                        {isActive && (
                          <span className="absolute h-6 w-6 rounded-full bg-indigo-400/40 animate-pulse-ring" />
                        )}
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <StageIcon
                            className={`h-4 w-4 relative ${isActive ? 'text-indigo-300' : 'text-slate-600'}`}
                          />
                        )}
                      </div>
                      <span
                        className={`text-xs font-mono leading-tight ${
                          isActive ? 'text-indigo-200' : isDone ? 'text-emerald-300/80' : 'text-slate-600'
                        }`}
                      >
                        {stage.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Skeleton preview while the first results haven't landed yet */}
          {loading && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 rounded-xl border border-slate-800 bg-slate-900 animate-shimmer" />
              ))}
            </div>
          )}

          {errorMsg && (
            <div className="mt-6 p-4 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-sm animate-fade-in-up">
              {errorMsg}
            </div>
          )}
        </div>
      </section>

      {/* Results View */}
      {auditData && (
        <section className="max-w-6xl mx-auto space-y-8">
          {/* Executive Scorecard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in-up">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Property</p>
                <h2 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-400" />
                  {auditData.hotelName || 'Hotel Property'}
                </h2>
                <a
                  href={auditData.targetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-500 hover:text-slate-400 mt-1 inline-flex items-center gap-1"
                >
                  {auditData.targetUrl} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Pages Ingested</p>
                <p className="text-3xl font-black text-white mt-1">{auditData.pages.length}</p>
                <p className="text-xs text-slate-500 mt-1">Multi-page fact extraction</p>
              </div>
              <Layers className="h-8 w-8 text-slate-700" />
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">AI Readability Score</p>
                <p
                  className={`text-3xl font-black mt-1 ${
                    auditData.overallScore >= 75
                      ? 'text-emerald-400'
                      : auditData.overallScore >= 50
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {auditData.overallScore}/100
                </p>
                <p className="text-xs text-slate-500 mt-1">LLM Extractability & Trust</p>
              </div>
              <ShieldCheck className="h-8 w-8 text-indigo-500/40" />
            </div>
          </div>

          {/* Executive Summary */}
          {auditData.summary && (
            <div
              className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-5 flex items-start gap-3 animate-fade-in-up"
              style={{ animationDelay: '60ms' }}
            >
              <Sparkles className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">
                  Executive Summary
                </p>
                <p className="text-sm text-slate-300 leading-relaxed">{auditData.summary}</p>
              </div>
            </div>
          )}

          {/* Deterministic Category Score Breakdown */}
          {auditData.categoryScores && (
            <div
              className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl animate-fade-in-up"
              style={{ animationDelay: '75ms' }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-400" /> Score Breakdown
              </h3>
              <p className="text-[11px] text-slate-500 mb-4">
                Computed deterministically from crawled schema, page coverage, structure, and cross-page facts — not model-generated, so re-running an audit reproduces the same scores.
              </p>
              <div className="space-y-3">
                {categories
                  .filter((c) => c.key !== 'ALL')
                  .map((cat) => {
                    const score = auditData.categoryScores?.[cat.key] ?? 0;
                    return (
                      <div key={cat.key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-300">{cat.label}</span>
                          <span className="font-mono text-slate-400">{score}/100</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Crawled Pages, grouped by type */}
          <div
            className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl animate-fade-in-up"
            style={{ animationDelay: '90ms' }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-400" /> Analyzed Pages ({auditData.pages.length})
            </h3>
            <div className="space-y-3">
              {pagesByType.map((group) => (
                <div key={group.type}>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    {group.label} <span className="text-slate-600">({group.pages.length})</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.pages.map((p) => (
                      <span
                        key={p.id}
                        className="bg-slate-800 text-slate-300 text-xs px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1.5 font-mono"
                        title={p.url}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {p.url.replace(auditData.targetUrl, '') || '/'}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Severity Breakdown + Category Filter Pills */}
          <div className="space-y-3 pt-2 border-t border-slate-800 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
            <div className="flex flex-wrap items-center gap-2 pt-4">
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
                <span
                  key={sev}
                  className={`text-xs px-2.5 py-1 rounded-full font-mono font-semibold ${SEVERITY_STYLES[sev]}`}
                >
                  {severityCounts[sev]} {sev}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                    selectedCategory === cat.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {cat.label}
                  {cat.key !== 'ALL' && (
                    <span className="ml-1.5 opacity-60">{categoryCounts[cat.key] || 0}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Suggestion Cards, grouped by category */}
          <div className="space-y-8">
            {filteredSuggestions.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500">
                No issues detected under this category.
              </div>
            ) : (
              groupedSuggestions.map((group) => (
                <div key={group.key} className="space-y-4">
                  {selectedCategory === 'ALL' && (
                    <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                      {group.label}
                      <span className="text-xs font-mono text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full">
                        {group.items.length}
                      </span>
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

                    return (
                      <div
                        key={item.id}
                        className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors animate-fade-in-up"
                        style={{ animationDelay: `${Math.min(idx, 8) * 45}ms` }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-mono font-bold uppercase ${SEVERITY_STYLES[item.severity]}`}
                            >
                              {item.severity} Severity
                            </span>
                            <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                              {item.category.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-slate-500">
                            Confidence: {(item.confidenceScore * 100).toFixed(0)}%
                          </span>
                        </div>

                        <h4 className="text-base font-semibold text-slate-100 flex items-start gap-2 mb-2">
                          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                          {item.issue}
                        </h4>

                        <div className="space-y-3 mt-4 text-sm">
                          {/* Impact */}
                          <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                              Why this degrades AI Engine Visibility:
                            </p>
                            <p className="text-slate-300 leading-relaxed">{item.impactReason}</p>
                          </div>

                          {/* Suggested Fix */}
                          <div className="bg-indigo-950/30 p-3.5 rounded-lg border border-indigo-500/20">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                                Actionable Optimization Fix:
                              </p>
                              <button
                                onClick={() => copyToClipboard(item.suggestedFix, item.id)}
                                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono"
                              >
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
                            <pre className="text-slate-200 text-xs font-mono whitespace-pre-wrap leading-relaxed mt-1">
                              {item.suggestedFix}
                            </pre>
                          </div>

                          {/* Affected URLs */}
                          {affectedUrls.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-xs text-slate-500">Origin:</span>
                              {affectedUrls.map((u, i) => (
                                <span
                                  key={i}
                                  className="text-xs text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded"
                                >
                                  {u}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </main>
  );
}
