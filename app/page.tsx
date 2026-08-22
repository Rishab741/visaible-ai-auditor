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
  ChevronRight,
  ShieldCheck,
  Search
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
}

interface AuditScanResult {
  id: string;
  targetUrl: string;
  hotelName: string;
  overallScore: number;
  status: string;
  pages: ScannedPage[];
  suggestions: Suggestion[];
}

export default function Dashboard() {
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<string>('');
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
    setActiveStep('Crawling subpages (Rooms, Amenities, Dining, Location)...');

    try {
      setTimeout(() => setActiveStep('Extracting JSON-LD & parsing machine-readable entities...'), 4000);
      setTimeout(() => setActiveStep('AI Engine cross-referencing multi-page consistency & coverage...'), 9000);

      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Audit failed');

      setAuditData(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred during analysis.');
    } finally {
      setLoading(false);
      setActiveStep('');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const categories = [
    { key: 'ALL', label: 'All Audits' },
    { key: 'CONTENT_CLARITY', label: 'Content Clarity' },
    { key: 'INTERNAL_CONSISTENCY', label: 'Cross-Page Consistency' },
    { key: 'STRUCTURED_DATA', label: 'Schema & Structured Data' },
    { key: 'PAGE_COVERAGE', label: 'Coverage & Gaps' },
    { key: 'STRUCTURAL_SIGNALS', label: 'Structural Extraction' },
  ];

  const filteredSuggestions = auditData?.suggestions.filter((s) =>
    selectedCategory === 'ALL' ? true : s.category === selectedCategory
  ) || [];

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
                placeholder="Enter hotel website URL (e.g. https://www.examplehotel.com)"
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

          {/* Stepper Status */}
          {loading && (
            <div className="mt-6 p-4 rounded-lg bg-indigo-950/40 border border-indigo-500/30 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
              <span className="text-sm text-indigo-200 font-mono">{activeStep}</span>
            </div>
          )}

          {errorMsg && (
            <div className="mt-6 p-4 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-sm">
              {errorMsg}
            </div>
          )}
        </div>
      </section>

      {/* Results View */}
      {auditData && (
        <section className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
          {/* Executive Scorecard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

          {/* Crawled Pages Strip */}
          <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-400" /> Analyzed Subpages
            </h3>
            <div className="flex flex-wrap gap-2">
              {auditData.pages.map((p) => (
                <span
                  key={p.id}
                  className="bg-slate-800 text-slate-300 text-xs px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1.5 font-mono"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {p.url.replace(auditData.targetUrl, '') || '/'}
                </span>
              ))}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
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
              </button>
            ))}
          </div>

          {/* Suggestion Cards */}
          <div className="space-y-4">
            {filteredSuggestions.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500">
                No issues detected under this category.
              </div>
            ) : (
              filteredSuggestions.map((item) => {
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
                    className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-mono font-bold uppercase ${
                            item.severity === 'HIGH'
                              ? 'bg-red-950 text-red-400 border border-red-800'
                              : item.severity === 'MEDIUM'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-blue-950 text-blue-400 border border-blue-800'
                          }`}
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
              })
            )}
          </div>
        </section>
      )}
    </main>
  );
}