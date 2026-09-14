import { prisma } from './prisma';

export interface RateLimitCheck {
  allowed: boolean;
  /** Only set when `allowed` is false. */
  retryAfterMs?: number;
}

interface RateLimitRow {
  count: number;
  windowStart: Date;
}

/**
 * Fixed-window per-key rate limiter backed by Postgres (see the
 * RateLimitBucket schema comment for why: no shared in-memory state across
 * serverless instances to count against otherwise). Guards the routes that
 * spend real LLM/Firecrawl cost per request -- without this, anyone can hit
 * them in a loop (forceRefresh even bypasses the scan cache) and run up the
 * bill with no ceiling.
 *
 * One atomic INSERT ... ON CONFLICT round trip, not a separate read then
 * write -- a plain findUnique-then-upsert both costs an extra network round
 * trip to a remote Postgres (meaningful latency on every protected request)
 * and leaves a real race: two concurrent requests for the same key can both
 * read "under limit" before either one's write lands, letting more than
 * `limit` through. Postgres's own row-level lock on the upsert target
 * serializes concurrent callers instead.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitCheck> {
  const rows = await prisma.$queryRaw<RateLimitRow[]>`
    INSERT INTO "RateLimitBucket" AS rlb (key, count, "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rlb."windowStart" <= now() - (${windowMs} * interval '1 millisecond')
                   THEN 1 ELSE rlb.count + 1 END,
      "windowStart" = CASE WHEN rlb."windowStart" <= now() - (${windowMs} * interval '1 millisecond')
                   THEN now() ELSE rlb."windowStart" END
    RETURNING count, "windowStart"
  `;
  const row = rows[0];
  const windowStart = new Date(row.windowStart).getTime();

  if (row.count > limit) {
    return { allowed: false, retryAfterMs: Math.max(windowMs - (Date.now() - windowStart), 0) };
  }
  return { allowed: true };
}

/** Best-effort client IP from the headers Vercel's edge network sets on every request. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export function rateLimitResponse(retryAfterMs: number | undefined, message: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (retryAfterMs) headers.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
  return new Response(JSON.stringify({ error: message }), { status: 429, headers });
}
