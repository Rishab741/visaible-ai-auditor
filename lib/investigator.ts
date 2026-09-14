import { generateText, stepCountIs } from 'ai';
import { fastModel } from './ai';
import { ExtractedPageData } from './crawler';
import { createCrawlPageTool, createSearchLinksTool } from './tools';
import { stableSeed } from './utils';

const EXPECTED_PAGE_TYPES = ['OFFERINGS', 'ABOUT', 'LOCATION', 'POLICIES'];
// Per-category budget (search_links, then crawl_page, plus one spare step for
// a follow-up search with different keywords) -- each missing category now
// runs as its own independent agent conversation, in parallel with the
// others (see investigateGaps), instead of all of them sharing one long
// sequential conversation. That used to mean a site missing all 4 categories
// paid for 4 categories' worth of model+fetch round trips back to back --
// measured at ~30s wall-clock for just 2 missing categories in production.
// Running them concurrently bounds wall-clock to the slowest *single*
// category instead of the sum of all of them.
const STEPS_PER_CATEGORY = 3;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  OFFERINGS: ['room', 'suite', 'accommodat', 'menu', 'eat', 'drink', 'product', 'service', 'shop', 'store', 'book', 'amenit', 'facilit', 'dining', 'restaurant'],
  ABOUT: ['about', 'story', 'who-we-are', 'team', 'history'],
  // Contact info folded in here rather than its own category — see the
  // matching comment in lib/pipeline.ts's classifyPageType.
  LOCATION: ['location', 'direction', 'map', 'visit', 'hours', 'contact', 'reach'],
  POLICIES: ['polic', 'terms', 'faq', 'frequently asked', 'cancellation', 'privacy', 'returns'],
};

/** One missing category's own bounded agent conversation — isolated so investigateGaps can run several of these concurrently instead of one long sequential conversation covering every gap. */
async function investigateOneCategory(params: {
  targetUrl: string;
  category: string;
  onCrawled: (page: ExtractedPageData) => void;
}): Promise<void> {
  try {
    await generateText({
      model: fastModel,
      tools: {
        search_links: createSearchLinksTool(params.targetUrl),
        crawl_page: createCrawlPageTool(params.onCrawled),
      },
      stopWhen: stepCountIs(STEPS_PER_CATEGORY),
      temperature: 0,
      seed: stableSeed(params.targetUrl + params.category),
      maxRetries: 3,
      system: `You are investigating one gap in a website crawl. The initial discovery pass did NOT find a page for this category: ${params.category}.

Use search_links on the homepage (${params.targetUrl}) with relevant keywords, then crawl_page any promising match. Only crawl a page you have real evidence is relevant from its URL or link text — never guess or fabricate a URL. If you can't find a page for this category after searching, stop.`,
      prompt: `Missing category: ${params.category}\nLikely keywords to try: ${CATEGORY_KEYWORDS[params.category].join(', ')}`,
    });
  } catch (err) {
    console.warn(`Gap-filling investigator failed for category ${params.category}, continuing without it:`, err);
  }
}

/**
 * Strictly additive gap-filling, run after static discovery+crawl (which is
 * unchanged and still crawls everything it finds). Only spends an LLM call at
 * all when a page category expected of a local business site (offerings/
 * about/location/policies) wasn't found by static discovery — then gives each
 * missing category its own bounded agent, all running concurrently, to try to
 * locate and crawl one page for it.
 *
 * This can only add pages, never remove or skip ones static discovery already
 * found — the "ingest every page" behavior stays fully intact. Any failure
 * here (model error, no matches found, tool error) just means that category
 * gets zero bonus pages; it never fails or degrades the surrounding scan.
 */
export async function investigateGaps(params: {
  targetUrl: string;
  presentPageTypes: Set<string>;
  alreadyCrawledUrls: Set<string>;
}): Promise<ExtractedPageData[]> {
  const missingTypes = EXPECTED_PAGE_TYPES.filter((t) => !params.presentPageTypes.has(t));
  if (missingTypes.length === 0) {
    return []; // fast path: nothing to investigate, zero LLM calls, zero cost
  }

  const newPages: ExtractedPageData[] = [];
  // Local copy — investigateGaps must not mutate the caller's Set as a side effect.
  // Shared across the concurrent per-category runs below; safe without a lock
  // because JS callbacks never preempt each other mid-execution, so each
  // onCrawled() call's Set.has/add pair still runs atomically relative to the
  // others even though the surrounding tool-call fetches interleave.
  const seenUrls = new Set(params.alreadyCrawledUrls);
  const onCrawled = (page: ExtractedPageData) => {
    if (seenUrls.has(page.url)) return;
    seenUrls.add(page.url);
    newPages.push(page);
  };

  await Promise.all(missingTypes.map((category) => investigateOneCategory({ targetUrl: params.targetUrl, category, onCrawled })));

  return newPages;
}
