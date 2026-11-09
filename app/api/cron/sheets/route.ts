import {constantEqual, config} from '../../../../lib/auth';
import {syncTasks} from '../../../../lib/sheets';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 240;
export async function GET(req: Request) {
  const secret = config('CRON_SECRET');
  if (!secret || !constantEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`))
    return Response.json({error:'Unauthorized'}, {status:401});
  if (config('SHEETS_WORKER_ENABLED') !== 'true' || (config('VERCEL_ENV') && config('VERCEL_ENV') !== 'production'))
    return Response.json({error:'Worker disabled in this environment'}, {status:503});
  try {
    const result = await syncTasks(3);
    if (result.pending && !result.synced) console.warn('Sheets worker has pending work; check sync health in Settings.');
    return Response.json(result, {headers:{'Cache-Control':'no-store'}});
  } catch {
    console.error('Sheets worker failed; inspect database and sync configuration.');
    return Response.json({error:'Sync worker failed'}, {status:500});
  }
}
