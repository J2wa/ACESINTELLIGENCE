import { isIP } from 'node:net';
import { one, sha, fail, stmt } from './auth';
// Only trust headers overwritten by the configured ingress. Never trust generic
// forwarded headers on a directly reachable origin.
export function clientIp(req: Request) {
  const proxy = process.env.TRUSTED_PROXY || (process.env.VERCEL === '1' ? 'vercel' : 'none');
  const header = proxy === 'vercel' ? 'x-vercel-forwarded-for' : proxy === 'cloudflare' ? 'cf-connecting-ip' : null;
  if (!header) return null;
  const value = req.headers.get(header)?.trim();
  if (!value || !isIP(value)) return null;
  return value.includes(':') ? new URL(`http://[${value}]/`).hostname : value;
}
export async function throttleLogin(req: Request, email: string, now = Date.now()) {
  const accountKey = await sha(email), ip = clientIp(req);
  const keys: [string, number][] = [[accountKey, 10]];
  if (ip) keys.push(['ip:' + await sha(ip), 100]);
  // Each increment and threshold check is one atomic SQLite statement; parallel
  // serverless invocations cannot all slip through a SELECT/UPDATE race.
  for (const [key, limit] of keys) {
    const row = await one(`INSERT INTO login_attempts(key,attempts,reset_at) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,
      reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END
      WHERE reset_at<=? OR attempts<? RETURNING attempts`, key, now + 900000, now, now, now, limit);
    if (!row) fail('Too many attempts. Try again in 15 minutes.', 429);
  }
  await stmt('DELETE FROM login_attempts WHERE reset_at<=?', now).run();
  return accountKey;
}
