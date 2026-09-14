import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateImplementationSnippet, NotApplicableError } from '@/lib/snippetAgent';
import { checkRateLimit, clientIp, rateLimitResponse } from '@/lib/rateLimit';

// Same reasoning as the bulk route (app/api/audit/[id]/snippets) -- one LLM
// call per request, no auth in front of it. A higher ceiling than the bulk
// route since this is the idempotent per-card version (already-generated
// suggestions short-circuit before spending a call at all).
const SNIPPET_RATE_LIMIT = 20;
const SNIPPET_RATE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { allowed, retryAfterMs } = await checkRateLimit(`snippet:${clientIp(req)}`, SNIPPET_RATE_LIMIT, SNIPPET_RATE_WINDOW_MS);
    if (!allowed) {
      return rateLimitResponse(retryAfterMs, 'Too many fix-generation requests from this address -- try again shortly.');
    }

    const { id } = await params;

    const suggestion = await prisma.optimizationSuggestion.findUnique({
      where: { id },
      include: { auditScan: { include: { pages: true } } },
    });

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    // Idempotent — don't re-spend an LLM call if this was already generated.
    if (suggestion.implementationSnippet) {
      return NextResponse.json({ implementationSnippet: suggestion.implementationSnippet });
    }

    const affectedUrls: string[] = (() => {
      try {
        return JSON.parse(suggestion.affectedUrls);
      } catch {
        return [suggestion.affectedUrls];
      }
    })();

    const relevantPages = suggestion.auditScan.pages.filter((p) => affectedUrls.includes(p.url));
    const pageExcerpts = (relevantPages.length > 0 ? relevantPages : suggestion.auditScan.pages.slice(0, 3)).map(
      (p) => ({
        url: p.url,
        markdownExcerpt: p.markdownContent.slice(0, 4000),
        schemaJsonLd: JSON.parse(p.rawJsonLd || '[]'),
      })
    );

    const snippet = await generateImplementationSnippet({
      category: suggestion.category,
      issue: suggestion.issue,
      impactReason: suggestion.impactReason,
      suggestedFix: suggestion.suggestedFix,
      detectedCms: suggestion.auditScan.detectedCms,
      pageExcerpts,
    });

    await prisma.optimizationSuggestion.update({
      where: { id },
      data: { implementationSnippet: snippet },
    });

    return NextResponse.json({ implementationSnippet: snippet });
  } catch (error: unknown) {
    if (error instanceof NotApplicableError) {
      // A legitimate outcome (this fix isn't snippet-shaped), not a failure.
      return NextResponse.json({ error: error.message, notApplicable: true }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : 'Failed to generate implementation snippet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
