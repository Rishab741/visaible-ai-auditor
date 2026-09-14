/** affectedUrls is stored as a JSON-array string; some legacy rows may be a bare string. */
export function parseAffectedUrls(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export type Actionability = 'diy' | 'developer';

// Display order: from most tangible/basic ("do you even have the right
// pages") to most behind-the-scenes ("machine-readable tags", "layout
// structure") — a narrative arc that works for a reader with no technical
// background, rather than the engine's own internal weighting order.
export const CATEGORY_KEYS = ['PAGE_COVERAGE', 'CONTENT_CLARITY', 'INTERNAL_CONSISTENCY', 'STRUCTURED_DATA', 'STRUCTURAL_SIGNALS'] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  PAGE_COVERAGE: 'Missing Pages',
  CONTENT_CLARITY: 'Clear, Findable Facts',
  INTERNAL_CONSISTENCY: 'Consistent Info',
  STRUCTURED_DATA: 'AI-Readable Tags',
  STRUCTURAL_SIGNALS: 'Easy-to-Scan Pages',
};

// Deliberately jargon-free (no "Schema.org", "JSON-LD", etc.) -- these are
// the descriptions shown directly in the report UI. Technical detail still
// lives in each finding's own suggestedFix, for developer handoff.
export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  PAGE_COVERAGE: 'Does your site have the pages AI assistants expect, like About, Location, and Policies?',
  CONTENT_CLARITY: 'Are your hours, prices, and policies written out in plain text — not buried in a photo or vague wording?',
  INTERNAL_CONSISTENCY: 'Do your hours, address, and prices say the same thing on every page?',
  STRUCTURED_DATA: 'Behind-the-scenes tags that help AI assistants understand exactly what your business offers.',
  STRUCTURAL_SIGNALS: 'Are your pages broken into headings and lists AI tools can quickly scan, instead of one big wall of text?',
};

// Static, category-based classification of who can act on a finding.
// STRUCTURED_DATA/STRUCTURAL_SIGNALS findings are inherently code/markup
// changes; the other three are text/content edits any site editor can make.
// An unrecognized category defaults to "developer" -- the safer
// overestimate if this list doesn't cover a future category.
const CATEGORY_ACTIONABILITY: Record<string, Actionability> = {
  PAGE_COVERAGE: 'diy',
  CONTENT_CLARITY: 'diy',
  INTERNAL_CONSISTENCY: 'diy',
  STRUCTURED_DATA: 'developer',
  STRUCTURAL_SIGNALS: 'developer',
};

export function getActionability(category: string): Actionability {
  return CATEGORY_ACTIONABILITY[category] ?? 'developer';
}

export const ACTIONABILITY_LABELS: Record<Actionability, string> = {
  diy: 'You can do this',
  developer: 'Needs a developer',
};

export const ACTIONABILITY_DESCRIPTIONS: Record<Actionability, string> = {
  diy: 'This just needs a text or content change on your site.',
  developer: 'This needs code added to your site — share it with whoever manages your website.',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  HIGH: 'Fix first',
  MEDIUM: 'Worth fixing',
  LOW: 'Nice to have',
};

export const SEVERITY_DESCRIPTIONS: Record<Severity, string> = {
  HIGH: "AI assistants likely can't find or trust this fact at all right now.",
  MEDIUM: "This makes AI assistants less confident, but it doesn't block them outright.",
  LOW: 'A small polish — unlikely to change whether an AI assistant recommends you.',
};

const SEVERITY_ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export interface PrioritizableSuggestion {
  id: string;
  category: string;
  severity: Severity;
}

/**
 * Picks the small set of "do these first" items for the Top Priorities
 * panel: severity first (LOW is excluded entirely -- that's polish, not a
 * priority), then DIY fixes before developer-needed ones as a tiebreaker, so
 * a non-technical reader's first look surfaces something they can act on
 * immediately rather than something that requires finding a developer first.
 */
export function pickTopPriorities<T extends PrioritizableSuggestion>(suggestions: T[], limit = 3): T[] {
  return suggestions
    .filter((s) => s.severity !== 'LOW')
    .slice()
    .sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sevDiff !== 0) return sevDiff;
      const aDiy = getActionability(a.category) === 'diy' ? 0 : 1;
      const bDiy = getActionability(b.category) === 'diy' ? 0 : 1;
      return aDiy - bDiy;
    })
    .slice(0, limit);
}

/** One plain-English sentence interpreting the overall score, for readers who don't know what "72/100" is supposed to mean. */
export function scoreInterpretation(score: number): string {
  if (score >= 80) return 'AI assistants can find and trust clear information about your business.';
  if (score >= 60) return 'AI assistants can find some information, but gaps are holding you back from full visibility.';
  if (score >= 40) return 'AI assistants are missing a lot of what they need to confidently recommend your business.';
  return "Your website is largely invisible to AI assistants right now — there's real opportunity here.";
}
