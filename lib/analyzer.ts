import { generateObject } from 'ai';
import { z } from 'zod';
import { reasoningModel } from './ai';
import { ExtractedPageData } from './crawler';

// Define the schema for structured suggestions output
const SuggestionItemSchema = z.object({
  category: z.enum([
    'CONTENT_CLARITY',
    'PAGE_COVERAGE',
    'STRUCTURED_DATA',
    'INTERNAL_CONSISTENCY',
    'STRUCTURAL_SIGNALS',
  ]),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  issue: z.string().describe('Precise description of the factual or structural ambiguity detected'),
  impactReason: z.string().describe('Why this reduces AI engine (ChatGPT, Perplexity, Gemini) extractability, confidence, or recommendation likelihood'),
  suggestedFix: z.string().describe('Clear, actionable change or structured schema snippet to resolve the issue'),
  affectedUrls: z.array(z.string()).describe('List of crawled URLs where this issue occurs or originates'),
  currentSnippet: z.string().optional().describe('Direct quote of the problematic text from the site if applicable'),
  confidenceScore: z.number().min(0).max(1).describe('Model confidence score between 0 and 1'),
});

const AnalysisReportSchema = z.object({
  hotelName: z.string().describe('Name of the hotel extracted from pages'),
  overallAiReadabilityScore: z.number().min(0).max(100).describe('Estimated readiness score for AI answer engines (0-100)'),
  summary: z.string().describe('A 2-3 sentence executive summary of the hotel website AI-readiness'),
  suggestions: z.array(SuggestionItemSchema).describe('Comprehensive, non-generic list of optimization suggestions'),
});

export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;

/**
 * Analyzes multiple crawled hotel pages to identify issues degrading AI engine visibility.
 */
export async function analyzeHotelWebsite(pages: ExtractedPageData[]): Promise<AnalysisReport> {
  const preparedPages = pages.map((page, index) => ({
    pageNumber: index + 1,
    url: page.url,
    title: page.title,
    schemaJsonLd: page.schemaJsonLd,
    markdownExcerpt: page.markdown.slice(0, 7500), // Protect token boundaries per subpage
  }));

  const systemPrompt = `
You are an expert AI Visibility and GEO (Generative Engine Optimization) Engineer for Visaible.
Your mission is to audit hotel websites for AI Answer Engine readability (ChatGPT, Perplexity, Google Gemini, Apple Intelligence).

Unlike traditional SEO audits that focus on backlinks and keyword stuffing, your analysis evaluates how AI LLMs parse, summarize, extract entities, and reason about hotel information.

Key Evaluation Pillars:
1. Content Clarity & Structure:
   - Identify marketing fluff lacking factual anchors (e.g. "luxurious oasis" without stating pool dimensions, check-in times, or exact bed configs).
   - Flag pages mixing multiple intents or lacking concise, answer-friendly sections.

2. Page Coverage & Gaps:
   - Missing room categories, square footage/meters, breakfast types, or parking details.
   - Unstated policies (cancellation, pet weight limits, child occupancy).

3. Structured Data & Machine Readability:
   - Missing or incomplete Schema.org (Hotel, LodgingBusiness, Room, Restaurant, FAQPage).
   - Conflicts between visible page text and Schema JSON-LD attributes.

4. Internal Consistency (CRITICAL):
   - Compare facts ACROSS pages. Flag any contradiction (e.g., Page 1 says pool closes at 8 PM, Page 3 says 10 PM; or inconsistent pet rules).

5. Structural Signals:
   - Vital hotel policies or amenities buried in deep body paragraphs rather than extractable lists or tables.

Guidelines:
- Suggestions MUST be specific, highly actionable, and reference actual facts from the provided text.
- Avoid generic recommendations (e.g. do not just say "Add more schema" — specify exactly which Schema.org type and properties are missing).
`;

  const userPrompt = `
Analyze the following multi-page crawl of this hotel website:

${JSON.stringify(preparedPages, null, 2)}

Provide a thorough analysis with an overall AI readability score and actionable suggestions mapped to the 5 categories.
`;

  const { object } = await generateObject({
    model: reasoningModel,
    schema: AnalysisReportSchema,
    system: systemPrompt,
    prompt: userPrompt,
  });

  return object;
}