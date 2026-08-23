import { tool } from 'ai';
import { z } from 'zod';
import { crawlHotelPage, ExtractedPageData } from './crawler';
import { findLinksByKeywords } from './discovery';

/**
 * ai-sdk tool wrapping crawlHotelPage. The full ExtractedPageData is handed
 * to onCrawled (so it flows into the same pipeline/scoring path as every
 * statically-discovered page) — the agent itself only sees a small summary,
 * to keep its context lean.
 */
export function createCrawlPageTool(onCrawled: (page: ExtractedPageData) => void) {
  return tool({
    description:
      'Fetch and extract a single web page: clean text content, JSON-LD structured data, and structural signals. Only call this on a URL you have real evidence is relevant — never guess a URL.',
    inputSchema: z.object({
      url: z.string().url().describe('The absolute URL of the page to crawl'),
    }),
    execute: async ({ url }) => {
      try {
        const page = await crawlHotelPage(url);
        onCrawled(page);
        return {
          success: true,
          url: page.url,
          title: page.title,
          wordCount: page.signals.wordCount,
          hasStructuredData: page.schemaJsonLd.length > 0,
          excerpt: page.markdown.slice(0, 400),
        };
      } catch (err) {
        return { success: false, url, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });
}

/** ai-sdk tool wrapping findLinksByKeywords, scoped to the site's own path prefix. */
export function createSearchLinksTool(scopeRootUrl: string) {
  return tool({
    description:
      "Search a page's links for URLs matching keywords, e.g. find a policies or cancellation page by searching the homepage for those keywords. Scoped to this property's own pages only.",
    inputSchema: z.object({
      searchPageUrl: z.string().url().describe('URL of the page to search for links on (usually the homepage)'),
      keywords: z
        .array(z.string())
        .min(1)
        .describe('Keywords to match against link text and URL paths, e.g. ["polic", "cancellation", "terms"]'),
    }),
    execute: async ({ searchPageUrl, keywords }) => {
      try {
        const matches = await findLinksByKeywords(searchPageUrl, scopeRootUrl, keywords);
        return { success: true, matches };
      } catch (err) {
        return { success: false, matches: [], error: err instanceof Error ? err.message : String(err) };
      }
    },
  });
}
