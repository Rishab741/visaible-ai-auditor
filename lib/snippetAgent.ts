import { generateText } from 'ai';
import { fastModel } from './ai';
import { stableSeed } from './utils';

/** Thrown when a suggestion legitimately doesn't reduce to a pasteable snippet (e.g. "create a new page") — a valid outcome, not a failure. */
export class NotApplicableError extends Error {}

export interface SnippetPageExcerpt {
  url: string;
  markdownExcerpt: string;
  schemaJsonLd: unknown[];
}

export interface SnippetContext {
  category: string;
  issue: string;
  impactReason: string;
  suggestedFix: string;
  detectedCms: string | null;
  pageExcerpts: SnippetPageExcerpt[];
}

/**
 * Focused, single-purpose, on-demand agent: given ONE already-generated
 * suggestion, produce a ready-to-paste implementation artifact for it.
 *
 * Deliberately separate from the main audit (lib/analyzer.ts) — this used to
 * run automatically for every suggestion on every search, bundling a distinct
 * "act on this" capability into a plain audit. Now it's triggered explicitly,
 * per-suggestion, by a user action.
 */
export async function generateImplementationSnippet(context: SnippetContext): Promise<string> {
  const cms = context.detectedCms === 'wordpress' ? 'wordpress' : 'unknown';

  const systemPrompt = `You are a focused implementation agent for Arthur AI. Given ONE specific AI-visibility optimization suggestion for a local business's website, produce a single, complete, ready-to-paste code artifact that implements the fix.

Rules:
- Ground every fact in the provided page content — never invent product names, services, prices, or numbers not present in the excerpts.
- If the detected CMS is "wordpress", format the output for pasting into a WordPress Custom HTML block (plain HTML/JSON-LD, no PHP, no shortcodes).
- If "unknown", produce plain HTML/JSON-LD.
- Output ONLY the snippet itself — no markdown code fences, no explanation, no preamble.
- If this suggestion genuinely cannot be reduced to a pasteable snippet (e.g. "create a new dedicated page"), output exactly: NOT_APPLICABLE`;

  const userPrompt = `Suggestion (category: ${context.category}, detected CMS: ${cms}):
Issue: ${context.issue}
Why it matters: ${context.impactReason}
Suggested fix: ${context.suggestedFix}

Relevant crawled page content:
${JSON.stringify(context.pageExcerpts, null, 2)}`;

  const { text } = await generateText({
    model: fastModel,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0,
    seed: stableSeed(context.issue + context.suggestedFix),
    maxRetries: 3,
  });

  const trimmed = text.trim();
  if (!trimmed || trimmed === 'NOT_APPLICABLE') {
    throw new NotApplicableError('This suggestion does not reduce to a pasteable implementation snippet.');
  }
  return trimmed;
}
