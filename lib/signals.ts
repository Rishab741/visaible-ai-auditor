import { ExtractedPageData } from './crawler';

export type Category =
  | 'CONTENT_CLARITY'
  | 'PAGE_COVERAGE'
  | 'STRUCTURED_DATA'
  | 'INTERNAL_CONSISTENCY'
  | 'STRUCTURAL_SIGNALS';

export type CategoryScores = Record<Category, number>;

export interface HardFinding {
  category: Category;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  /** The verbatim, code-verified fact — the LLM writes this up but must not alter what it asserts. */
  fact: string;
  affectedUrls: string[];
}

export interface SiteSignals {
  categoryScores: CategoryScores;
  overallScore: number;
  hardFindings: HardFinding[];
}

// Fixed, published weights — the overall score is a deterministic function of
// these five category scores, never a value the LLM invents. Internal
// Consistency and Structured Data are weighted highest per the audit brief's
// own framing (cross-page fact conflicts are flagged "CRITICAL").
const CATEGORY_WEIGHTS: CategoryScores = {
  STRUCTURED_DATA: 0.25,
  INTERNAL_CONSISTENCY: 0.25,
  CONTENT_CLARITY: 0.2,
  PAGE_COVERAGE: 0.15,
  STRUCTURAL_SIGNALS: 0.15,
};

// Schema.org's LocalBusiness vocabulary is broad and deep — a real audit hit
// this: a villa page tagged "HotelSuite" was wrongly flagged as missing
// offering schema because that type wasn't in this list. "localbusiness"
// itself covers anything generically tagged that way; the rest are the
// common named subtypes across hospitality, food, retail, and services so a
// specifically-typed site doesn't need the generic umbrella type too.
const LOCAL_BUSINESS_SCHEMA_TYPES = [
  'localbusiness',
  'hotel', 'lodgingbusiness', 'resort', 'motel', 'bedandbreakfast', 'hostel',
  'restaurant', 'foodestablishment', 'cafeorcoffeeshop', 'bakery', 'bar',
  'store', 'grocerystore', 'clothingstore', 'furniturestore',
  'professionalservice', 'legalservice', 'financialservice', 'realestateagent', 'accountingservice',
  'medicalbusiness', 'dentist', 'physician', 'healthandbeautybusiness', 'beautysalon', 'daySpa',
  'homeandconstructionbusiness', 'electrician', 'plumber', 'automotivebusiness', 'autorepair',
  'sportsactivitylocation', 'exercisegym', 'entertainmentbusiness',
];
// "Offering" generalizes hotel rooms to whatever a business actually sells or
// provides — a menu item, a service, a product, a room.
const OFFERING_SCHEMA_TYPES = ['product', 'service', 'offer', 'menuitem', 'room', 'hotelroom', 'suite', 'hotelsuite', 'apartment', 'accommodation'];
const FAQ_SCHEMA_TYPES = ['faqpage'];

const EXPECTED_PAGE_TYPES = ['OFFERINGS', 'ABOUT', 'LOCATION', 'POLICIES'];

const WALL_OF_TEXT_WORD_THRESHOLD = 180;

function flattenJsonLdTypes(schemaBlocks: unknown[]): string[] {
  const types: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (obj['@type']) {
      const t = obj['@type'];
      (Array.isArray(t) ? t : [t]).forEach((x) => types.push(String(x).toLowerCase()));
    }
    if (obj['@graph']) visit(obj['@graph']);
  };
  schemaBlocks.forEach(visit);
  return types;
}

interface ExtractedFact {
  type: 'checkin' | 'checkout';
  value: string;
  url: string;
}

function extractFacts(pages: ExtractedPageData[]): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  for (const page of pages) {
    const checkin = page.markdown.match(/check-?in[^.\n]{0,30}?(\d{1,2}(:\d{2})?\s?(am|pm))/i);
    if (checkin) facts.push({ type: 'checkin', value: checkin[1].toLowerCase().replace(/\s/g, ''), url: page.url });

    const checkout = page.markdown.match(/check-?out[^.\n]{0,30}?(\d{1,2}(:\d{2})?\s?(am|pm))/i);
    if (checkout) facts.push({ type: 'checkout', value: checkout[1].toLowerCase().replace(/\s/g, ''), url: page.url });
  }
  return facts;
}

/**
 * Computes all five audit category scores, the overall score, and a list of
 * "hard findings" purely from code — no LLM sampling involved. Given the same
 * crawled pages, this always returns the exact same scores and findings.
 */
export function computeSiteSignals(pages: ExtractedPageData[], pageTypes: Map<string, string>): SiteSignals {
  const hardFindings: HardFinding[] = [];

  // --- STRUCTURED_DATA ---
  const allTypes = new Set<string>();
  let pagesWithSchema = 0;
  for (const page of pages) {
    if (page.schemaJsonLd.length > 0) pagesWithSchema++;
    flattenJsonLdTypes(page.schemaJsonLd).forEach((t) => allTypes.add(t));
  }
  const hasLocalBusinessSchema = LOCAL_BUSINESS_SCHEMA_TYPES.some((t) => allTypes.has(t));
  const hasFaqSchema = FAQ_SCHEMA_TYPES.some((t) => allTypes.has(t));
  const offeringPages = pages.filter((p) => pageTypes.get(p.url) === 'OFFERINGS');
  const offeringPagesWithSchema = offeringPages.filter((p) =>
    flattenJsonLdTypes(p.schemaJsonLd).some((t) => OFFERING_SCHEMA_TYPES.includes(t))
  );

  const structuredDataScore = Math.round(
    (hasLocalBusinessSchema ? 40 : 0) +
      (pages.length > 0 ? (pagesWithSchema / pages.length) * 30 : 0) +
      (offeringPages.length > 0 ? (offeringPagesWithSchema.length / offeringPages.length) * 20 : 20) +
      (hasFaqSchema ? 10 : 0)
  );

  if (!hasLocalBusinessSchema) {
    hardFindings.push({
      category: 'STRUCTURED_DATA',
      severity: 'HIGH',
      fact: 'No LocalBusiness-family Schema.org JSON-LD structured data (e.g. Hotel, Restaurant, Store, ProfessionalService) was found anywhere on the site.',
      affectedUrls: pages.slice(0, 1).map((p) => p.url),
    });
  }
  if (offeringPages.length > 0 && offeringPagesWithSchema.length < offeringPages.length) {
    const missing = offeringPages.filter((p) => !offeringPagesWithSchema.includes(p));
    hardFindings.push({
      category: 'STRUCTURED_DATA',
      severity: 'MEDIUM',
      fact: `${missing.length} of ${offeringPages.length} offering pages are missing Product/Service/Offer Schema.org JSON-LD.`,
      affectedUrls: missing.map((p) => p.url),
    });
  }

  // --- PAGE_COVERAGE ---
  const presentTypes = new Set(Array.from(pageTypes.values()));
  const missingPageTypes = EXPECTED_PAGE_TYPES.filter((t) => !presentTypes.has(t));
  const pageCoverageScore = Math.round(
    ((EXPECTED_PAGE_TYPES.length - missingPageTypes.length) / EXPECTED_PAGE_TYPES.length) * 100
  );
  if (missingPageTypes.length > 0) {
    hardFindings.push({
      category: 'PAGE_COVERAGE',
      severity: missingPageTypes.length > 2 ? 'HIGH' : 'MEDIUM',
      fact: `No dedicated page was discovered for: ${missingPageTypes.join(', ')}.`,
      affectedUrls: pages.slice(0, 1).map((p) => p.url),
    });
  }

  // --- STRUCTURAL_SIGNALS ---
  const pagesWithSingleH1 = pages.filter((p) => p.signals.h1Count === 1).length;
  const pagesWithListOrTable = pages.filter((p) => p.signals.listCount + p.signals.tableCount > 0).length;
  const wallOfTextPages = pages.filter((p) => p.signals.longestBlockWords > WALL_OF_TEXT_WORD_THRESHOLD);

  const structuralSignalsScore =
    pages.length > 0
      ? Math.round(
          (pagesWithSingleH1 / pages.length) * 40 +
            (pagesWithListOrTable / pages.length) * 40 +
            ((pages.length - wallOfTextPages.length) / pages.length) * 20
        )
      : 0;

  if (wallOfTextPages.length > 0) {
    hardFindings.push({
      category: 'STRUCTURAL_SIGNALS',
      severity: 'MEDIUM',
      fact: `${wallOfTextPages.length} page(s) contain a dense paragraph of over ${WALL_OF_TEXT_WORD_THRESHOLD} words with no list, table, or heading break, burying details from easy extraction.`,
      affectedUrls: wallOfTextPages.map((p) => p.url),
    });
  }

  // --- CONTENT_CLARITY (factual-anchor coverage) ---
  const facts = extractFacts(pages);
  const hasCheckin = facts.some((f) => f.type === 'checkin');
  const hasCheckout = facts.some((f) => f.type === 'checkout');
  const anchorsFound = [hasCheckin, hasCheckout].filter(Boolean).length;
  const contentClarityScore = 40 + Math.round((anchorsFound / 2) * 60);

  if (!hasCheckin || !hasCheckout) {
    const missingAnchors = [!hasCheckin && 'check-in', !hasCheckout && 'check-out'].filter(Boolean).join(' and ');
    hardFindings.push({
      category: 'CONTENT_CLARITY',
      severity: 'MEDIUM',
      fact: `Explicit ${missingAnchors} time(s) were not found as extractable text on any crawled page.`,
      affectedUrls: pages.slice(0, 1).map((p) => p.url),
    });
  }

  // --- INTERNAL_CONSISTENCY (deterministic cross-page conflict detection) ---
  const byType = new Map<string, ExtractedFact[]>();
  for (const f of facts) {
    if (!byType.has(f.type)) byType.set(f.type, []);
    byType.get(f.type)!.push(f);
  }
  let conflictCount = 0;
  for (const [type, group] of byType) {
    const uniqueValues = new Set(group.map((f) => f.value));
    if (uniqueValues.size > 1) {
      conflictCount++;
      hardFindings.push({
        category: 'INTERNAL_CONSISTENCY',
        severity: 'HIGH',
        fact: `Conflicting ${type} times found across pages: ${group.map((f) => `"${f.value}" on ${f.url}`).join(' vs. ')}.`,
        affectedUrls: group.map((f) => f.url),
      });
    }
  }
  const internalConsistencyScore = Math.max(0, 100 - conflictCount * 30);

  const categoryScores: CategoryScores = {
    CONTENT_CLARITY: contentClarityScore,
    PAGE_COVERAGE: pageCoverageScore,
    STRUCTURED_DATA: structuredDataScore,
    INTERNAL_CONSISTENCY: internalConsistencyScore,
    STRUCTURAL_SIGNALS: structuralSignalsScore,
  };

  const overallScore = Math.round(
    (Object.entries(categoryScores) as [Category, number][]).reduce(
      (sum, [category, score]) => sum + score * CATEGORY_WEIGHTS[category],
      0
    )
  );

  return { categoryScores, overallScore, hardFindings };
}
