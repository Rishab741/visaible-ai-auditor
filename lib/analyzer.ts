import { generateObject } from 'ai';
import { z } from 'zod';
import { reasoningModel } from './ai';
import { ExtractedPageData } from './crawler';
import { computeSiteSignals, CategoryScores, HardFinding } from './signals';
import { stableSeed } from './utils';

const CategoryEnum = z.enum([
  'CONTENT_CLARITY',
  'PAGE_COVERAGE',
  'STRUCTURED_DATA',
  'INTERNAL_CONSISTENCY',
  'STRUCTURAL_SIGNALS',
]);

// Write-ups for the deterministic findings handed to the model — the model
// only supplies prose here. Category, severity, affectedUrls, and whether the
// finding exists at all are fixed by lib/signals.ts and never overridden.
//
// Implementation snippets are deliberately NOT generated here. Every audit
// used to trigger a snippet-generation attempt for every findable suggestion
// as part of this same call, bundling a distinct "act on this fix" capability
// into every plain search. That's now its own on-demand, per-suggestion agent
// — see lib/snippetAgent.ts — triggered by an explicit user action instead.
const HardFindingWriteupSchema = z.object({
  issue: z.string().describe('Precise description of the verified issue, referencing the given fact'),
  impactReason: z.string().describe('Why this reduces AI engine (ChatGPT, Perplexity, Gemini) extractability, confidence, or recommendation likelihood'),
  suggestedFix: z.string().describe('Clear, actionable change or structured schema snippet to resolve the issue'),
});

const AdditionalSuggestionSchema = z.object({
  category: CategoryEnum,
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  issue: z.string().describe('Precise description of a qualitative issue not covered by the deterministic findings (e.g. marketing fluff, mixed-intent pages)'),
  impactReason: z.string().describe('Why this reduces AI engine extractability, confidence, or recommendation likelihood'),
  suggestedFix: z.string().describe('Clear, actionable change to resolve the issue'),
  affectedUrls: z.array(z.string()).describe('Crawled URLs where this issue occurs'),
  currentSnippet: z.string().optional().describe('Direct quote of the problematic text from the site if applicable'),
  confidenceScore: z.number().min(0).max(1).describe('Model confidence score between 0 and 1'),
});

// Built per-call with .length(hardFindings.length) so a model response with the
// wrong number of write-ups fails schema validation — triggering generateObject's
// built-in retry — instead of silently degrading (see the fallback that used to
// exist here, patched with the raw fact when a write-up was missing).
function buildAnalysisReportSchema(hardFindingCount: number) {
  return z.object({
    hotelName: z.string().describe('Name of the hotel extracted from pages'),
    summary: z.string().describe('A 2-3 sentence executive summary of the hotel website AI-readiness'),
    hardFindingWriteups: z
      .array(HardFindingWriteupSchema)
      .length(hardFindingCount)
      .describe('Exactly one write-up per deterministic finding provided, in the same order — do not add, remove, or reorder'),
    additionalSuggestions: z
      .array(AdditionalSuggestionSchema)
      .describe('Additional non-generic suggestions for qualitative issues the deterministic checks cannot detect. Do not duplicate the deterministic findings.'),
  });
}

export interface SuggestionItem {
  category: z.infer<typeof CategoryEnum>;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  impactReason: string;
  suggestedFix: string;
  affectedUrls: string[];
  currentSnippet?: string;
  confidenceScore: number;
}

export interface AnalysisReport {
  hotelName: string;
  summary: string;
  overallAiReadabilityScore: number;
  categoryScores: CategoryScores;
  suggestions: SuggestionItem[];
}

/**
 * Analyzes multiple crawled hotel pages to identify issues degrading AI engine visibility.
 *
 * Scoring is deterministic: lib/signals.ts computes the 5 category scores, the
 * overall score, and a list of verified "hard findings" purely from code (schema
 * presence, page coverage, structural signals, cross-page fact conflicts) — none
 * of that comes from the LLM, so repeated audits of the same content always
 * produce the same numbers. The LLM's job is narrower: write up each hard
 * finding in plain language, plus flag genuinely qualitative issues (marketing
 * fluff, mixed-intent pages) that no rule can detect.
 */
export async function analyzeHotelWebsite(
  pages: ExtractedPageData[],
  pageTypes: Map<string, string>
): Promise<AnalysisReport> {
  const signals = computeSiteSignals(pages, pageTypes);

  const preparedPages = pages.map((page, index) => ({
    pageNumber: index + 1,
    url: page.url,
    title: page.title,
    pageType: pageTypes.get(page.url) ?? 'GENERAL',
    schemaJsonLd: page.schemaJsonLd,
    markdownExcerpt: page.markdown.slice(0, 7500), // Protect token boundaries per subpage
  }));

  const systemPrompt = `
You are an expert AI Visibility and GEO (Generative Engine Optimization) Engineer for Visaible.
Your mission is to audit hotel websites for AI Answer Engine readability (ChatGPT, Perplexity, Google Gemini, Apple Intelligence).

A deterministic rules engine has already scored this site and identified a fixed list of verified findings — schema gaps, missing page categories, structural issues, and cross-page factual conflicts. These are facts, not opinions: do not contradict, soften, or embellish them.

Your job:
1. For EACH deterministic finding listed below, write a precise "issue" description, "impactReason" (why it hurts AI extractability/trust), and "suggestedFix" (specific, actionable — name the exact Schema.org type/property if relevant). Output exactly one write-up per finding, in the same order.
2. Separately, scan the crawled content for genuinely qualitative issues the rules engine cannot detect: marketing fluff without factual anchors ("luxurious oasis" with no pool dimensions/times/configs), pages mixing multiple intents, vague experiential language, unstated policies. Only add these as "additionalSuggestions" — do not repeat anything already covered by a deterministic finding.

Guidelines:
- Suggestions MUST be specific and reference actual facts from the provided text — never generic ("add more schema" is not acceptable; name the exact type/property).
- Do not invent a numeric score anywhere; none is requested.
`;

  const userPrompt = `
Deterministic findings (write up exactly these, in order):
${JSON.stringify(signals.hardFindings, null, 2)}

Crawled pages:
${JSON.stringify(preparedPages, null, 2)}
`;

  // Low temperature + a seed derived from the crawled content keep the model's
  // prose converging on the same wording across repeated audits of the same
  // pages. The category/overall scores themselves never depend on this call.
  const contentFingerprint = preparedPages.map((p) => `${p.url}:${p.markdownExcerpt.length}`).join('|');

  const { object } = await generateObject({
    model: reasoningModel,
    schema: buildAnalysisReportSchema(signals.hardFindings.length),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0,
    seed: stableSeed(contentFingerprint),
    maxRetries: 3, // schema violations (e.g. wrong hardFindingWriteups count) and transient API errors both retry here
  });

  const hardFindingSuggestions: SuggestionItem[] = signals.hardFindings.map((finding: HardFinding, i: number) => {
    const writeup = object.hardFindingWriteups[i];
    return {
      category: finding.category,
      severity: finding.severity,
      issue: writeup.issue,
      impactReason: writeup.impactReason,
      suggestedFix: writeup.suggestedFix,
      affectedUrls: finding.affectedUrls,
      confidenceScore: 1, // deterministically verified, not model-estimated
    };
  });

  const additionalSuggestions: SuggestionItem[] = object.additionalSuggestions.map((s) => ({
    ...s,
    currentSnippet: s.currentSnippet || undefined,
  }));

  return {
    hotelName: object.hotelName,
    summary: object.summary,
    overallAiReadabilityScore: signals.overallScore,
    categoryScores: signals.categoryScores,
    suggestions: [...hardFindingSuggestions, ...additionalSuggestions],
  };
}
