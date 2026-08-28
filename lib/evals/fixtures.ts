import type { ExtractedPageData, PageStructuralSignals } from '../crawler';

function signals(overrides: Partial<PageStructuralSignals> = {}): PageStructuralSignals {
  return {
    h1Count: 1,
    headingCounts: { h1: 1, h2: 3, h3: 0, h4: 0, h5: 0, h6: 0 },
    listCount: 2,
    tableCount: 0,
    paragraphCount: 5,
    wordCount: 400,
    longestBlockWords: 60,
    ...overrides,
  };
}

function page(overrides: Partial<ExtractedPageData> & { url: string }): ExtractedPageData {
  return {
    title: 'Test Page',
    markdown: 'Some business content.',
    schemaJsonLd: [],
    signals: signals(),
    cms: 'unknown',
    ...overrides,
  };
}

// "Hotel" here is just one concrete, real Schema.org LocalBusiness subtype
// used to exercise the fixtures — the scoring engine accepts the whole
// LocalBusiness family (see lib/signals.ts LOCAL_BUSINESS_SCHEMA_TYPES).
const LOCAL_BUSINESS_SCHEMA = { '@context': 'https://schema.org', '@type': 'Hotel', name: 'Fixture Business', telephone: '+1-555-0100' };
const OFFERING_SCHEMA = { '@context': 'https://schema.org', '@type': 'Room', name: 'Deluxe Room' };
const FAQ_SCHEMA = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] };
// Real-world regression case: a villa page tagged @type: ["HotelSuite", "Product"]
// was wrongly flagged as missing offering schema before HotelSuite was added to
// OFFERING_SCHEMA_TYPES — see lib/evals/signals.eval.ts.
const HOTEL_SUITE_SCHEMA = { '@context': 'https://schema.org', '@type': ['HotelSuite', 'Product'], name: 'Fixture Suite' };

/** A well-built site: full schema, all page types present, clean structure, consistent facts. */
export const GOOD_SITE: { pages: ExtractedPageData[]; pageTypes: Map<string, string> } = {
  pages: [
    page({
      url: 'https://example.com/',
      schemaJsonLd: [LOCAL_BUSINESS_SCHEMA],
      markdown: 'Welcome. Check-in: 3:00pm. Check-out: 11:00am.',
    }),
    page({
      url: 'https://example.com/offerings',
      schemaJsonLd: [OFFERING_SCHEMA],
      markdown: 'Our rooms, amenities, and dining. Check-in: 3:00pm.',
    }),
    page({ url: 'https://example.com/about', markdown: 'About us. Check-in: 3:00pm.' }),
    page({ url: 'https://example.com/location', markdown: 'Located downtown. Check-in: 3:00pm.' }),
    page({
      url: 'https://example.com/policies',
      schemaJsonLd: [FAQ_SCHEMA],
      markdown: 'Cancellation policy. Check-in: 3:00pm. Check-out: 11:00am.',
    }),
    // Not one of the required categories (contact info is folded into
    // LOCATION) — included to prove an extra, non-required page doesn't
    // hurt PAGE_COVERAGE.
    page({ url: 'https://example.com/contact', markdown: 'Contact us. Check-in: 3:00pm.' }),
  ],
  pageTypes: new Map([
    ['https://example.com/', 'HOMEPAGE'],
    ['https://example.com/offerings', 'OFFERINGS'],
    ['https://example.com/about', 'ABOUT'],
    ['https://example.com/location', 'LOCATION'],
    ['https://example.com/policies', 'POLICIES'],
    ['https://example.com/contact', 'CONTACT'],
  ]),
};

/** A bare-bones site: no schema anywhere, only a homepage, no factual anchors. */
export const BARE_SITE: { pages: ExtractedPageData[]; pageTypes: Map<string, string> } = {
  pages: [page({ url: 'https://bare.example.com/', markdown: 'A luxurious oasis awaits you.' })],
  pageTypes: new Map([['https://bare.example.com/', 'HOMEPAGE']]),
};

/** Two pages disagreeing on check-in time — should trip the deterministic conflict detector. */
export const CONFLICTING_FACTS_SITE: { pages: ExtractedPageData[]; pageTypes: Map<string, string> } = {
  pages: [
    page({ url: 'https://conflict.example.com/', schemaJsonLd: [LOCAL_BUSINESS_SCHEMA], markdown: 'Check-in: 3:00pm.' }),
    page({
      url: 'https://conflict.example.com/offerings',
      schemaJsonLd: [OFFERING_SCHEMA],
      markdown: 'Check-in: 4:00pm.',
    }),
  ],
  pageTypes: new Map([
    ['https://conflict.example.com/', 'HOMEPAGE'],
    ['https://conflict.example.com/offerings', 'OFFERINGS'],
  ]),
};

/** An offering page using @type: ["HotelSuite", "Product"] instead of Room/Product — must still count as offering schema. */
export const HOTEL_SUITE_SITE: { pages: ExtractedPageData[]; pageTypes: Map<string, string> } = {
  pages: [
    page({ url: 'https://suite.example.com/', schemaJsonLd: [LOCAL_BUSINESS_SCHEMA] }),
    page({ url: 'https://suite.example.com/offerings', schemaJsonLd: [HOTEL_SUITE_SCHEMA] }),
  ],
  pageTypes: new Map([
    ['https://suite.example.com/', 'HOMEPAGE'],
    ['https://suite.example.com/offerings', 'OFFERINGS'],
  ]),
};

/** A page with one dense paragraph and no lists/headings — should trip the "wall of text" finding. */
export const WALL_OF_TEXT_SITE: { pages: ExtractedPageData[]; pageTypes: Map<string, string> } = {
  pages: [
    page({
      url: 'https://dense.example.com/',
      schemaJsonLd: [LOCAL_BUSINESS_SCHEMA],
      markdown: 'Check-in: 3:00pm. Check-out: 11:00am.',
      signals: signals({ h1Count: 1, listCount: 0, tableCount: 0, longestBlockWords: 250 }),
    }),
  ],
  pageTypes: new Map([['https://dense.example.com/', 'HOMEPAGE']]),
};
