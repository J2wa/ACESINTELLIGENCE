import { database } from './database';
export const DB = () => database;
export const config = (key: string) => process.env[key] ?? '';
export const stmt = (sql: string, ...args: unknown[]) => DB().prepare(sql).bind(...args);
export const one = async (sql: string, ...args: unknown[]) => await stmt(sql, ...args).first<any>();
export const all = async (sql: string, ...args: unknown[]) => (await stmt(sql, ...args).all<any>()).results;
export const id = () => crypto.randomUUID();
export const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(x => x.toString(16).padStart(2, '0')).join('');
export const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2, '0')).join('');
export async function hashPassword(p: string, salt = token()) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(p), 'PBKDF2', false, ['deriveBits']); const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256); return 'pbkdf2$100000$' + salt + '$' + Array.from(new Uint8Array(hash)).map(x => x.toString(16).padStart(2, '0')).join(''); }
export function constantEqual(a: string, b: string) { if (a.length !== b.length)
    return false; let diff = 0; for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
export async function checkPassword(p: string, h: string | null) { return !!h && constantEqual(await hashPassword(p, h.split('$')[2]), h); }
export function cookie(req: Request, name: string) { return (req.headers.get('cookie') ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) ?? ''; }
export function setCookie(req: Request, name: string, value: string, maxAge = 43200) { return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`; }
export async function session(req: Request) { const raw = cookie(req, 'aces_session'); if (!raw)
    return null; const hash = await sha(raw), now = Date.now(); const u = await one('SELECT u.id,u.name,u.email,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.last_seen>? AND u.active=1', hash, now, now - 1800000); if (u)
    await stmt('UPDATE sessions SET last_seen=? WHERE token_hash=?', now, hash).run(); return u; }
export async function loginResponse(req: Request, user: any) { const raw = token(), now = Date.now(); await stmt('INSERT INTO sessions(token_hash,user_id,last_seen,expires_at) VALUES(?,?,?,?)', await sha(raw), user.id, now, now + 43200000).run(); return new Response(JSON.stringify({ user: { id: user.id, name: user.name, email: user.email, role: user.role } }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookie(req, 'aces_session', raw), 'Cache-Control': 'no-store' } }); }
export function fail(message: string, status = 400, extra = {}) { throw Object.assign(new Error(message), { status, ...extra }); }
export function originCheck(req: Request) { const origin = req.headers.get('origin'); if (!origin || origin !== new URL(req.url).origin)
    fail('Request origin rejected.', 403); }
export const audit = (user: any, entity: string, entityId: string, action: string, before: unknown, after: unknown) => stmt('INSERT INTO audit_log(id,actor_id,entity,entity_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)', id(), user.id, entity, entityId, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, Date.now());
