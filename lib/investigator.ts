import { generateText, stepCountIs } from 'ai';
import { fastModel } from './ai';
import { ExtractedPageData } from './crawler';
import { createCrawlPageTool, createSearchLinksTool } from './tools';
import { stableSeed } from './utils';

const EXPECTED_PAGE_TYPES = ['OFFERINGS', 'ABOUT', 'LOCATION', 'POLICIES'];
const MAX_INVESTIGATOR_STEPS = 8;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  OFFERINGS: ['room', 'suite', 'accommodat', 'menu', 'eat', 'drink', 'product', 'service', 'shop', 'store', 'book', 'amenit', 'facilit', 'dining', 'restaurant'],
  ABOUT: ['about', 'story', 'who-we-are', 'team', 'history'],
  // Contact info folded in here rather than its own category — see the
  // matching comment in lib/pipeline.ts's classifyPageType.
  LOCATION: ['location', 'direction', 'map', 'visit', 'hours', 'contact', 'reach'],
  POLICIES: ['polic', 'terms', 'faq', 'cancellation', 'privacy', 'returns'],
};

/**
 * Strictly additive gap-filling, run after static discovery+crawl (which is
 * unchanged and still crawls everything it finds). Only spends an LLM call at
 * all when a page category expected of a local business site (offerings/
 * about/location/policies) wasn't found by static discovery — then gives a bounded
 * agent a few tool calls to try to locate and crawl one page for each gap.
 *
 * This can only add pages, never remove or skip ones static discovery already
 * found — the "ingest every page" behavior stays fully intact. Any failure
 * here (model error, no matches found, tool error) just means zero bonus
 * pages; it never fails or degrades the surrounding scan.
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
  const seenUrls = new Set(params.alreadyCrawledUrls);

  try {
    await generateText({
      model: fastModel,
      tools: {
        search_links: createSearchLinksTool(params.targetUrl),
        crawl_page: createCrawlPageTool((page) => {
          if (seenUrls.has(page.url)) return;
          seenUrls.add(page.url);
          newPages.push(page);
        }),
      },
      stopWhen: stepCountIs(MAX_INVESTIGATOR_STEPS),
      temperature: 0,
      seed: stableSeed(params.targetUrl + missingTypes.join(',')),
      maxRetries: 3,
      system: `You are investigating gaps in a website crawl. The initial discovery pass did NOT find a page for these categories: ${missingTypes.join(', ')}.

For each missing category, use search_links on the homepage (${params.targetUrl}) with relevant keywords, then crawl_page any promising match. Only crawl a page you have real evidence is relevant from its URL or link text — never guess or fabricate a URL. If you can't find a page for a category after searching, move on to the next one.`,
      prompt: `Missing categories and likely keywords to try:\n${missingTypes
        .map((t) => `- ${t}: ${CATEGORY_KEYWORDS[t].join(', ')}`)
        .join('\n')}`,
    });
  } catch (err) {
    console.warn('Gap-filling investigator failed, continuing with static discovery results only:', err);
  }

  return newPages;
}
