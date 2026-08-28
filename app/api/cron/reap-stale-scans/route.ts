import { NextRequest, NextResponse } from 'next/server';
import { reapAllStaleScans } from '@/lib/pipeline';

// Low-priority backstop, not load-bearing -- every read path that shows a
// non-terminal scan to a user (dashboard, results page, the recent-5 GET
// listing) already reaps stale scans on its own. This only catches a scan
// nobody ever manually revisits again. Hobby-plan Cron only runs daily, which
// is fine for that purpose.
export async function GET(req: NextRequest) {
  // Vercel forwards CRON_SECRET as a Bearer token on Cron-triggered requests
  // once it's set as a project env var -- checked only if configured, so this
  // doesn't lock out the cron trigger before that's set up.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const reaped = await reapAllStaleScans();
  console.log(`[cron reap-stale-scans] reaped ${reaped} stale scan(s)`);
  return NextResponse.json({ reaped });
}
