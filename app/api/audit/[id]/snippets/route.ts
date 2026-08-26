import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateImplementationSnippet, NotApplicableError } from '@/lib/snippetAgent';

const GENERATION_CONCURRENCY = 3;

// Same reasoning as app/api/audit/route.ts: batched sequential LLM calls
// (one per pending suggestion, GENERATION_CONCURRENCY at a time) can run
// well past Vercel's 10s default. 60s is the Hobby-plan ceiling.
export const maxDuration = 60;

/**
 * Bulk version of app/api/suggestions/[id]/snippet — generates implementation
 * snippets for every suggestion on a scan that doesn't already have one, as a
 * single "Generate Implementation Fixes" action rather than per-card buttons.
 * Suggestions that genuinely aren't snippet-shaped are skipped, not failed.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const scan = await prisma.auditScan.findUnique({
      where: { id },
      include: { suggestions: true, pages: true },
    });

    if (!scan) {
      return NextResponse.json({ error: 'Audit scan not found' }, { status: 404 });
    }

    const pending = scan.suggestions.filter((s) => !s.implementationSnippet);
    const results: Array<{ id: string; implementationSnippet?: string; notApplicable?: boolean; error?: string }> = [];

    for (let i = 0; i < pending.length; i += GENERATION_CONCURRENCY) {
      const batch = pending.slice(i, i + GENERATION_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (suggestion) => {
          const affectedUrls: string[] = (() => {
            try {
              return JSON.parse(suggestion.affectedUrls);
            } catch {
              return [suggestion.affectedUrls];
            }
          })();

          const relevantPages = scan.pages.filter((p) => affectedUrls.includes(p.url));
          const pageExcerpts = (relevantPages.length > 0 ? relevantPages : scan.pages.slice(0, 3)).map((p) => ({
            url: p.url,
            markdownExcerpt: p.markdownContent.slice(0, 4000),
            schemaJsonLd: JSON.parse(p.rawJsonLd || '[]'),
          }));

          try {
            const snippet = await generateImplementationSnippet({
              category: suggestion.category,
              issue: suggestion.issue,
              impactReason: suggestion.impactReason,
              suggestedFix: suggestion.suggestedFix,
              detectedCms: scan.detectedCms,
              pageExcerpts,
            });
            await prisma.optimizationSuggestion.update({
              where: { id: suggestion.id },
              data: { implementationSnippet: snippet },
            });
            return { id: suggestion.id, implementationSnippet: snippet };
          } catch (err) {
            if (err instanceof NotApplicableError) {
              return { id: suggestion.id, notApplicable: true };
            }
            return { id: suggestion.id, error: err instanceof Error ? err.message : 'Failed to generate snippet' };
          }
        })
      );
      results.push(...batchResults);
    }

    return NextResponse.json({ results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate implementation fixes';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
