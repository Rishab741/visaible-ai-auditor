import { NextRequest, NextResponse } from 'next/server';
import { driveAllActiveScans } from '@/lib/pipeline';

// Recovery backstop for the one gap a single after()-scheduled
// driveAuditScan continuation can't close on its own: it only gets ~50s of
// background budget from whatever request triggered it, and if a scan's
// slowest single step doesn't finish inside that window with nobody left to
// trigger a fresh continuation (client gone, tab closed), it just sits idle
// until the ABANDONED_MS reaper eventually kills it. Hitting this endpoint
// on any schedule finer than Vercel Hobby's daily Cron closes that gap --
// e.g. a free external 1-minute pinger (cron-job.org or similar) pointed at
// this URL. Entirely optional: nothing breaks without it, scans just recover
// less promptly when a client fully vanishes mid-audit.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const deadline = Date.now() + 50_000;
  const { scansTouched } = await driveAllActiveScans(deadline);
  console.log(`[cron advance-active-scans] touched ${scansTouched} active scan(s)`);
  return NextResponse.json({ scansTouched });
}
