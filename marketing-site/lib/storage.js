import { createHmac } from 'node:crypto';
export async function redis(command, env = process.env) {
  const response = await fetch(env.FORMS_REDIS_URL, {method:'POST', headers:{Authorization:`Bearer ${env.FORMS_REDIS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('storage_unavailable');
  const data = await response.json();
  if (data.error) throw new Error('storage_unavailable');
  return data.result;
}
export function allowedOrigin(request, env = process.env) {
  const allowed = new Set(['https://acesintelligence.xyz','https://agents.acesintelligence.xyz']);
  if (env.VERCEL_ENV === 'preview' && env.VERCEL_URL) allowed.add(`https://${env.VERCEL_URL}`);
  if (env.NODE_ENV === 'test') allowed.add('https://preview.example.test');
  return allowed.has(request.headers.get('origin'));
}
export async function rateLimit(request, scope, limit, env = process.env, execute = redis) {
  // Vercel supplies this header. Never use the client-controlled generic X-Forwarded-For.
  const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const digest = createHmac('sha256',env.RATE_LIMIT_SECRET).update(ip).digest('hex');
  const key = `aces:rate:${scope}:${digest}:${Math.floor(Date.now()/600000)}`;
  const count = await execute(['EVAL',"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],600) end; return n",'1',key],env);
  return Number(count) <= limit;
}
export async function limitedBody(request, maximum) {
  if (Number(request.headers.get('content-length')) > maximum) throw new Error('too_large');
  if (!request.body) return new Uint8Array();
  const reader=request.body.getReader(), chunks=[];let size=0;
  try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum){await reader.cancel();throw new Error('too_large');}chunks.push(value);} }
  finally {reader.releaseLock();}
  return Buffer.concat(chunks);
}
