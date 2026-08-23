import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateImplementationSnippet, NotApplicableError } from '@/lib/snippetAgent';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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
