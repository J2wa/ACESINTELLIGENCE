import { ensureDeletionSchema, changeDeletion } from './admin-deletion';
import { invoicePdf } from './invoice-pdf';
import { getClient } from './database';
import { z } from 'zod';
import { DB, stmt, one, all, id, sha, token, hashPassword, checkPassword, cookie, setCookie, session, loginResponse, fail, originCheck, audit, config, constantEqual } from './auth';
import { parseDuration, taskHours, hoursSignature, payrollRows, PAY_BASES, allocateTaskTime, duration, day, midnight, weekStart, addDays, splitDays, STATUSES, csv, xlsx } from './core.mjs';
import { ensureTimerSchema } from './timer-schema.mjs';
import { ensureLogSchema } from './log-schema';
import { syncTasks } from './sheets';
import { ensurePayrollSchema, paymentPreview, recordPayment, invoiceDetail } from './payroll';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const name = z.string().trim().min(1).max(150), password = z.string().min(12, 'Use at least 12 characters.').max(128), uid = z.string().min(1).max(100), date = z.string().refine(v => { try {
    midnight(v);
    return true;
}
catch {
    return false;
} }, 'Invalid date'), email = z.string().trim().email().max(254).transform(v => v.toLowerCase());
const taskInput = z.object({ id: uid.optional(), version: z.number().int().optional(), date, project_id: uid, account_id: uid, video_id: z.string().min(1).max(250).refine(v => v.trim().length > 0, 'Task ID is required.'), user_id: uid.optional(), duration: z.string().optional(), status: z.enum(['PENDING', 'APPROVED', 'RETURNED', 'SKIPPED (NO CHANGES)']), notes: z.string().max(5000).default(''), start_ms: z.number().int().optional(), minutes: z.number().int().min(0).max(1440).default(0) });
const admin = (u: any) => { if (u.role !== 'ADMIN')
    fail('Administrator access required.', 403); };
const safeSync = async (limit = 3, taskId?: string) => { try { return await syncTasks(limit, taskId); } catch { return { synced: 0, pending: true, message: 'Saved in Workhub. Spreadsheet sync is queued for retry.' }; } };
const queue = (task: string) => stmt("INSERT INTO sync_jobs(task_id,status,updated_at) VALUES(?,'pending',?) ON CONFLICT(task_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at", task, Date.now());
async function assignment(u: any, project: string, account?: string) { const p = await one("SELECT p.*,(SELECT deleted_at FROM deleted_records WHERE entity=\'projects\' AND entity_id=p.id) AS deleted_at,COALESCE(s.enabled,0) AS time_tracking_enabled FROM projects p LEFT JOIN project_time_tracking s ON s.project_id=p.id WHERE p.id=? AND p.status='active'", project); if (!p)
    fail('Choose an active project.'); if (u.role !== 'ADMIN' && !await one('SELECT 1 FROM project_assignments WHERE project_id=? AND user_id=?', project, u.id))
    fail('You are not assigned to this project.', 403); if (account) {
    if (!await one('SELECT 1 FROM accounts WHERE id=? AND project_id=? AND active=1', account, project))
        fail('Choose an active account for this project.');
    if (u.role !== 'ADMIN' && !await one('SELECT 1 FROM account_assignments WHERE account_id=? AND user_id=?', account, u.id))
        fail('You are not assigned to this account.', 403);
} return p; }
async function taskOwner(u: {id: string; role: string}, requested?: string, existing?: string) {
    if (u.role !== 'ADMIN' && requested && requested !== u.id) fail('You can only log your own tasks.', 403);
    if (existing && requested && requested !== existing) fail('The annotator cannot change on an existing task.');
    const who = existing ?? requested ?? u.id;
    if (!existing && !await one('SELECT 1 FROM users WHERE id=? AND active=1', who)) fail('Choose an active annotator.');
    return who;
}
function taskMeasures(b: {duration?: string; minutes: number}, basis: string) {
    // Ignore hidden fields, including stale values after switching project types.
    return { seconds: basis === 'VIDEO_HOUR' ? parseDuration(b.duration) : 0, minutes: basis === 'TASK' ? 0 : b.minutes };
}
async function editableWeek(user: string, start: number, end = start + 1) { if (await one("SELECT 1 FROM timesheets WHERE user_id=? AND status IN ('SUBMITTED','APPROVED') AND start_ms<? AND end_ms>?", user, end, start))
    fail('This week is locked. Ask your coordinator to return the timesheet.', 409); }
async function dailyWarning(user: string, start: number, end: number) { for (const d of splitDays(start, end)) {
    const a = midnight(d.date), b = a + 86400000, rows = await all('SELECT start_ms,end_ms FROM time_entries WHERE user_id=? AND start_ms<? AND COALESCE(end_ms,?)>?', user, b, Date.now(), a);
    const secs = rows.reduce((sum, r) => sum + Math.max(0, Math.min(r.end_ms ?? Date.now(), b) - Math.max(r.start_ms, a)) / 1000, 0);
    if (secs > 43200)
        return 'You have logged more than 12 hours in a Manila day. Please review your entries.';
} return null; }
async function snapshot(u: any) {
    const where = u.role === 'ADMIN' ? '' : ' WHERE t.user_id=?', args = u.role === 'ADMIN' ? [] : [u.id];
    const result = {
        user: u, users: await all('SELECT id,name,email,role,active,(SELECT deleted_at FROM deleted_records WHERE entity=\'users\' AND entity_id=users.id) AS deleted_at FROM users' + (u.role === 'ADMIN' ? '' : ' WHERE id=?'), ...args),
        projects: await all('SELECT p.*,(SELECT deleted_at FROM deleted_records WHERE entity=\'projects\' AND entity_id=p.id) AS deleted_at,COALESCE(s.enabled,0) AS time_tracking_enabled FROM projects p LEFT JOIN project_time_tracking s ON s.project_id=p.id' + (u.role === 'ADMIN' ? '' : ' WHERE p.id IN (SELECT project_id FROM project_assignments WHERE user_id=?)'), ...args),
        accounts: await all('SELECT * FROM accounts' + (u.role === 'ADMIN' ? '' : ' WHERE id IN (SELECT account_id FROM account_assignments WHERE user_id=?)'), ...args),
        assignments: await all('SELECT * FROM project_assignments' + (u.role === 'ADMIN' ? '' : ' WHERE user_id=?'), ...args), account_assignments: await all('SELECT * FROM account_assignments' + (u.role === 'ADMIN' ? '' : ' WHERE user_id=?'), ...args),
        tasks: await all('SELECT t.*,(SELECT invoice_id FROM payment_tasks WHERE task_id=t.id) AS paid_invoice_id,(SELECT COALESCE(SUM((end_ms-start_ms)/1000),0) FROM time_entries WHERE task_id=t.id AND end_ms IS NOT NULL) AS spent_seconds FROM task_entries t' + where + ' ORDER BY date DESC,created_at DESC', ...args),
        times: await all('SELECT t.*,(SELECT invoice_id FROM payment_times WHERE time_entry_id=t.id) AS paid_invoice_id FROM time_entries t' + where + ' ORDER BY start_ms DESC', ...args), sheets: await all('SELECT t.* FROM timesheets t' + where + ' ORDER BY week_start DESC', ...args),
        invoices: await all('SELECT t.*,(SELECT deleted_at FROM deleted_records WHERE entity=\'invoices\' AND entity_id=t.id) AS deleted_at FROM payment_invoices t' + where + ' ORDER BY paid_at DESC,number DESC', ...args), invoice_items: await all('SELECT t.* FROM payment_invoice_items t' + where, ...args),
        sync: u.role === 'ADMIN' ? await all("SELECT task_id,status,last_error,updated_at FROM sync_jobs UNION ALL SELECT task_id,CASE WHEN last_error IS NULL THEN 'pending' ELSE 'error' END,last_error,updated_at FROM deleted_task_sync") : [], settings: u.role === 'ADMIN' ? { spreadsheet_id: (await one("SELECT value FROM settings WHERE key='spreadsheet_id'"))?.value ?? '', google_configured: !!config('GOOGLE_CLIENT_ID'), sheets_configured: !!config('GOOGLE_SERVICE_ACCOUNT_JSON'), google_only: config('GOOGLE_ONLY') === 'true' } : {}
    };
    const reviews = await all('SELECT r.* FROM task_hour_reviews r JOIN task_entries t ON t.id=r.task_id' + (u.role === 'ADMIN' ? '' : ' WHERE t.user_id=?'), ...args);
    result.tasks = result.tasks.map((t: any) => taskHours(t, result.times, reviews.find((r: any) => r.task_id === t.id), result.sheets));
    return result;
}
export async function handle(req: Request) {
    try {
        const path = new URL(req.url).pathname.replace(/^\/api\//, ''), method = req.method, now = Date.now();
        if (!['GET', 'HEAD'].includes(method))
            originCheck(req);
        if (['auth/me','auth/login','auth/google','auth/google/callback'].includes(path) && config('ADMIN_EMAIL') && config('ADMIN_PASSWORD_HASH')) {
            const adminEmail = config('ADMIN_EMAIL').trim().toLowerCase();
            const hash = config('ADMIN_PASSWORD_HASH');
            if (!/^pbkdf2\$100000\$[a-f0-9]{64}\$[a-f0-9]{64}$/.test(hash)) fail('Administrator password hash configuration is invalid.',503);
            await stmt("INSERT INTO users(id,name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,'ADMIN',1,?) ON CONFLICT(email) DO NOTHING",id(),config('ADMIN_NAME')||'Administrator',adminEmail,hash,now).run();
        }
        if (path === 'auth/me') {
            const u = await session(req);
            if (u) { await ensurePayrollSchema(); await ensureLogSchema(); await ensureTimerSchema(getClient()); await ensureDeletionSchema(); }
            return json({ user: u, setup: !await one('SELECT id FROM users LIMIT 1'), owner_setup: false, google_configured: !!config('GOOGLE_CLIENT_ID'), google_only: config('GOOGLE_ONLY') === 'true' });
        }
        if (path === 'auth/setup' && method === 'POST') {
            if (await one('SELECT id FROM users LIMIT 1'))
                fail('Workspace is already initialized.', 409);
            const b = z.object({ name, email, password, bootstrap_token: z.string().optional() }).parse(await req.json());
            const trusted = false;
            if (!trusted && (!config('BOOTSTRAP_TOKEN') || !constantEqual(b.bootstrap_token ?? '', config('BOOTSTRAP_TOKEN'))))
                fail('A valid bootstrap token is required.', 403);
            const u = { id: id(), name: b.name, email: b.email, role: 'ADMIN' };
            await DB().batch([stmt("INSERT INTO users(id,name,email,password_hash,role,created_at) SELECT ?,?,?,?,'ADMIN',? WHERE NOT EXISTS(SELECT 1 FROM users)", u.id, u.name, u.email, await hashPassword(b.password), now)]);
            if (!await one('SELECT id FROM users WHERE id=?', u.id))
                fail('Workspace is already initialized.', 409);
            return loginResponse(req, u);
        }
        if (path === 'auth/login' && method === 'POST') {
            if (config('GOOGLE_ONLY') === 'true')
                fail('Please sign in with Google.', 403);
            const b = z.object({ email, password: z.string().max(128) }).parse(await req.json());
            const key = await sha(b.email), ip = await sha(req.headers.get('cf-connecting-ip') ?? 'local');
            for (const k of [key, 'ip:' + ip]) {
                const a = await one('SELECT * FROM login_attempts WHERE key=?', k);
                if (a && a.reset_at > now && a.attempts >= 10)
                    fail('Too many attempts. Try again in 15 minutes.', 429);
                await stmt('INSERT INTO login_attempts(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END', k, now + 900000, now, now).run();
            }
            const u = await one('SELECT * FROM users WHERE email=? AND active=1', b.email);
            const valid = await checkPassword(b.password, u?.password_hash ?? await hashPassword(token()));
            if (!u || !valid)
                fail('Email or password is incorrect.', 401);
            await stmt('DELETE FROM login_attempts WHERE key=?', key).run();
            return loginResponse(req, u);
        }
        if (path === 'auth/google' && method === 'GET') {
            if (!config('GOOGLE_CLIENT_ID') || !config('GOOGLE_CLIENT_SECRET'))
                fail('Google sign-in is not configured.', 503);
            const state = token(), verifier = token(), challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
            await stmt('INSERT INTO oauth_states(state_hash,verifier,expires_at) VALUES(?,?,?)', await sha(state), verifier, now + 600000).run();
            const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
            url.search = new URLSearchParams({ client_id: config('GOOGLE_CLIENT_ID'), redirect_uri: config('APP_URL') + '/api/auth/google/callback', response_type: 'code', scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString();
            return new Response(null, { status: 302, headers: { Location: url.toString(), 'Set-Cookie': setCookie(req, 'aces_oauth', state, 600) } });
        }
        if (path === 'auth/google/callback' && method === 'GET') {
            const params = new URL(req.url).searchParams, state = params.get('state') ?? '';
            if (!state || !constantEqual(state, cookie(req, 'aces_oauth')))
                fail('Sign-in state mismatch.', 403);
            const saved = await one('DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING *', await sha(state), now);
            if (!saved || !params.get('code'))
                fail('Google sign-in expired. Please try again.', 403);
            const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code: params.get('code')!, client_id: config('GOOGLE_CLIENT_ID'), client_secret: config('GOOGLE_CLIENT_SECRET'), redirect_uri: config('APP_URL') + '/api/auth/google/callback', grant_type: 'authorization_code', code_verifier: saved.verifier }), signal: AbortSignal.timeout(10000) });
            if (!r.ok)
                fail('Google sign-in could not be verified.', 401);
            const tok = await r.json() as any, info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(10000) });
            if (!info.ok)
                fail('Google identity could not be verified.', 401);
            const g = await info.json() as any;
            if (!g.email_verified || !g.email || !g.sub)
                fail('Use a verified Google email.', 403);
            const u = await one('SELECT * FROM users WHERE email=? AND active=1', g.email.toLowerCase());
            if (!u || (u.google_sub && u.google_sub !== g.sub))
                fail('Ask your coordinator to create an account for this email.', 403);
            await stmt('UPDATE users SET google_sub=? WHERE id=?', g.sub, u.id).run();
            const response = await loginResponse(req, u);
            response.headers.set('Location', '/');
            return new Response(null, { status: 302, headers: response.headers });
        }
        const u = await session(req, path !== 'sync');
        if (!u)
            fail('Your session has expired. Please sign in.', 401);
        await ensurePayrollSchema();
        await ensureLogSchema(); await ensureTimerSchema(getClient()); await ensureDeletionSchema();
        if (path === 'admin/deletion' && method === 'POST') {
            admin(u);
            const b = z.object({ entity:z.enum(['projects','users','invoices']), id:uid, action:z.enum(['delete','restore']) }).parse(await req.json());
            return json(await changeDeletion(u,b.entity,b.id,b.action));
        }
        if (path === 'auth/logout' && method === 'POST') {
            await stmt('DELETE FROM sessions WHERE token_hash=?', await sha(cookie(req, 'aces_session'))).run();
            return new Response('{}', { headers: { 'Set-Cookie': setCookie(req, 'aces_session', '', 0) } });
        }
        if (path === 'auth/password' && method === 'POST') {
            const b = z.object({ current_password: z.string(), password }).parse(await req.json()), record = await one('SELECT password_hash FROM users WHERE id=?', u.id);
            if (record.password_hash && !await checkPassword(b.current_password, record.password_hash))
                fail('Current password is incorrect.', 403);
            await DB().batch([stmt('UPDATE users SET password_hash=? WHERE id=?', await hashPassword(b.password), u.id), stmt('DELETE FROM sessions WHERE user_id=?', u.id), audit(u, 'users', u.id, 'password_changed', null, null)]);
            return loginResponse(req, u);
        }
        if (path === 'workspace' && method === 'GET')
            return json(await snapshot(u));
        if (['payroll/preview', 'payroll/pay'].includes(path) && method === 'POST') {
            admin(u);
            const filtersInput = z.object({ from: date.optional(), to: date.optional(), employee: z.string().max(100).optional(), project: z.string().max(100).optional(), account: z.string().max(100).optional(), status: z.string().max(50).optional() }).strict();
            if (path === 'payroll/preview') {
                const b = z.object({ filters: filtersInput }).strict().parse(await req.json());
                if (b.filters.from && b.filters.to && b.filters.from > b.filters.to) fail('Choose a valid date range.');
                return json(await paymentPreview(u, b.filters));
            }
            const b = z.object({ filters: filtersInput, signature:z.string().regex(/^[a-f0-9]{64}$/), request_id:z.string().uuid(), reference:z.string().max(250).default(''), notes:z.string().max(2000).default('') }).strict().parse(await req.json());
            const result = await recordPayment(u, b);
            await safeSync(3);
            return json(result);
        }
        if (path.startsWith('invoices/') && method === 'GET') {
            const invoice = await invoiceDetail(u, path.slice('invoices/'.length));
            if (new URL(req.url).searchParams.get('format') === 'pdf') {
                const body = await invoicePdf(invoice);
                return new Response(new Uint8Array(body), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoice.number}.pdf"`, 'Cache-Control': 'private, no-store' } });
            }
            if (new URL(req.url).searchParams.get('format') === 'csv') {
                const body = csv([['INVOICE',invoice.number],['EMPLOYEE',invoice.employee_name],['PAID ON',new Date(invoice.paid_at).toISOString()],['TOTAL PAID (PHP)',invoice.total_cents/100],['REFERENCE',invoice.reference],['NOTES',invoice.notes],[],['WORK DATE','TASK ID','PROJECT','ACCOUNT','PAY BASIS','UNITS','RATE (PHP)','PAID (PHP)'],...invoice.items.map((line:any)=>[line.work_date,line.task_label,line.project_name,line.account_name,PAY_BASES[line.pay_basis as keyof typeof PAY_BASES],line.units,line.rate_cents/100,line.amount_cents/100])]);
                return new Response(body,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${invoice.number}.csv"`,'Cache-Control':'no-store'}});
            }
            return json(invoice);
        }
        if (path === 'tasks' && method === 'POST') {
            const b = taskInput.parse(await req.json());
            const old = b.id ? await one('SELECT * FROM task_entries WHERE id=?', b.id) : null;
            if (b.id && !old)
                fail('Task not found.', 404);
            if (old && old.user_id !== u.id && u.role !== 'ADMIN')
                fail('You can only edit your own entries.', 403);
            if (u.role !== 'ADMIN' && !['PENDING', 'SKIPPED (NO CHANGES)'].includes(b.status))
                fail('Only coordinators can approve or return tasks.', 403);
            const p = await assignment(u, b.project_id, b.account_id);
            const who = await taskOwner(u, b.user_id, old?.user_id);
            const { seconds, minutes } = taskMeasures(b, old?.pay_basis ?? p.pay_basis);
            if (old) {
                await editableWeek(old.user_id, midnight(old.date));
                if (old.version !== b.version)
                    fail('This entry changed. Refresh before editing.', 409);
                if (old.project_id !== b.project_id || old.account_id !== b.account_id)
                    fail('Project and account cannot change on an existing entry.');
            }
            await editableWeek(who, midnight(b.date));
            const duplicate = await one('SELECT id,user_id FROM task_entries WHERE project_id=? AND account_id=? AND video_id=? AND id!=?', b.project_id, b.account_id, b.video_id, b.id ?? '');
            if (duplicate)
                fail('This task ID already exists in this project and account.', 409, { existing_id: u.role === 'ADMIN' || duplicate.user_id === u.id ? duplicate.id : null, duplicate: true });
            const taskId = b.id ?? id(), after = { ...b, id: taskId, duration_seconds: seconds, user_id: who };
            const statements: any[] = [];
            if (old)
                statements.push(stmt('UPDATE task_entries SET date=?,video_id=?,duration_seconds=?,status=?,notes=?,version=?,updated_at=? WHERE id=?', b.date, b.video_id, seconds, b.status, b.notes, b.version! + 1, now, taskId));
            else
                statements.push(stmt('INSERT INTO task_entries(id,date,project_id,account_id,user_id,video_id,duration_seconds,status,notes,created_at,updated_at,pay_basis,rate_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', taskId, b.date, b.project_id, b.account_id, who, b.video_id, seconds, b.status, b.notes, now, now, p.pay_basis, p.rate_cents));
            if (minutes > 0) {
                if (old)
                    fail('Edit working time in Timesheets to avoid double counting.');
                const dateStart = midnight(b.date);
                const existing = await all('SELECT start_ms,end_ms FROM time_entries WHERE user_id=? AND start_ms<? AND COALESCE(end_ms,?)>?', who, dateStart + 86400000, now, dateStart);
                let slots;
                try { slots = allocateTaskTime(b.date, minutes, existing, now); }
                catch (error) { fail((error as Error).message); }
                for (const slot of slots!) {
                    await editableWeek(who, slot.start_ms, slot.end_ms);
                    statements.push(stmt("INSERT INTO time_entries(id,project_id,user_id,task_id,start_ms,end_ms,rate_cents,source,notes,created_at,pay_basis) VALUES(?,?,?,?,?,?,?,'task',?,?,?)", id(), b.project_id, who, taskId, slot.start_ms, slot.end_ms, p.rate_cents, 'Task minutes: automatically allocated; not exact clock times.', now, p.pay_basis));
                }
            }
            statements.push(audit(u, 'task_entries', taskId, old ? 'updated' : 'created', old, after), queue(taskId));
            await DB().batch(statements);
            let sync = 'queued';
            try {
                const r = await syncTasks(1, taskId);
                if (r.synced)
                    sync = 'synced';
            }
            catch { /* durable outbox retries from Settings */ }
            return json({ saved: true, id: taskId, sync, warning: minutes ? await dailyWarning(who, midnight(b.date), midnight(addDays(b.date, 1))) : null });
        }
        if (path === 'tasks/bulk' && method === 'POST') {
            const parsed = z.object({ tasks: z.array(taskInput.omit({ id: true, version: true, start_ms: true }).strict()).min(1, 'Enter at least one task.').max(100, 'Upload up to 100 tasks at a time.') }).strict().safeParse(await req.json());
            if (!parsed.success) return json({ error: parsed.error.issues.map(issue => `${typeof issue.path[1] === 'number' ? `Row ${issue.path[1] + 1}: ` : ''}${issue.path.slice(2).join('.')}${issue.path.length > 2 ? ': ' : ''}${issue.message}`).join(' ') }, 400);
            const rows = parsed.data.tasks;
            const seen = new Set<string>();
            for (let index = 0; index < rows.length; index++) {
                const row = rows[index], key = JSON.stringify([row.project_id, row.account_id, row.video_id]);
                if (seen.has(key)) fail(`Row ${index + 1}: This task ID appears more than once in the upload.`, 409);
                seen.add(key);
            }
            const statements: any[] = [], projectCache = new Map<string, any>(), unlocked = new Set<string>(), dayTimes = new Map<string, any[]>();
            for (let index = 0; index < rows.length; index++) {
                const row = rows[index];
                try {
                    if (u.role !== 'ADMIN' && !['PENDING', 'SKIPPED (NO CHANGES)'].includes(row.status)) fail('Only coordinators can approve or return tasks.', 403);
                    const projectKey = JSON.stringify([row.project_id, row.account_id]);
                    if (!projectCache.has(projectKey)) projectCache.set(projectKey, await assignment(u, row.project_id, row.account_id));
                    const project = projectCache.get(projectKey), dateStart = midnight(row.date), taskId = id();
                    const who = await taskOwner(u, row.user_id), dayKey = JSON.stringify([who, row.date]);
                    const { seconds, minutes } = taskMeasures(row, project.pay_basis);
                    if (!unlocked.has(dayKey)) { await editableWeek(who, dateStart); unlocked.add(dayKey); }
                    statements.push(stmt('INSERT INTO task_entries(id,date,project_id,account_id,user_id,video_id,duration_seconds,status,notes,created_at,updated_at,pay_basis,rate_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', taskId, row.date, row.project_id, row.account_id, who, row.video_id, seconds!, row.status, row.notes, now, now, project.pay_basis, project.rate_cents));
                    if (minutes > 0) {
                        if (!dayTimes.has(dayKey)) dayTimes.set(dayKey, await all('SELECT start_ms,end_ms FROM time_entries WHERE user_id=? AND start_ms<? AND COALESCE(end_ms,?)>?', who, dateStart + 86400000, now, dateStart));
                        const entries = dayTimes.get(dayKey)!;
                        let slots;
                        try { slots = allocateTaskTime(row.date, minutes, entries, now); } catch (error) { fail((error as Error).message); }
                        for (const slot of slots!) {
                            entries.push(slot);
                            statements.push(stmt("INSERT INTO time_entries(id,project_id,user_id,task_id,start_ms,end_ms,rate_cents,source,notes,created_at,pay_basis) VALUES(?,?,?,?,?,?,?,'task',?,?,?)", id(), row.project_id, who, taskId, slot.start_ms, slot.end_ms, project.rate_cents, 'Task minutes: automatically allocated; not exact clock times.', now, project.pay_basis));
                        }
                    }
                    statements.push(audit(u, 'task_entries', taskId, 'created', null, { ...row, id: taskId, user_id: who, duration_seconds: seconds! }), queue(taskId));
                } catch (error: any) {
                    if (error.status || error.message.startsWith('Use h:mm:ss')) fail(`Row ${index + 1}: ${error.message}`, error.status ?? 400);
                    throw error;
                }
            }
            const duplicates = await all('SELECT project_id,account_id,video_id FROM task_entries WHERE ' + rows.map(() => '(project_id=? AND account_id=? AND video_id=?)').join(' OR '), ...rows.flatMap(row => [row.project_id, row.account_id, row.video_id]));
            if (duplicates.length) {
                const index = rows.findIndex(row => duplicates.some(existing => existing.project_id === row.project_id && existing.account_id === row.account_id && existing.video_id === row.video_id));
                fail(`Row ${index + 1}: This task ID already exists in the selected project and account.`, 409);
            }
            // One transaction prevents partial uploads, including when a concurrent edit creates a conflict.
            await DB().batch(statements);
            await safeSync(3);
            const longDay = [...dayTimes].some(([key, entries]) => { const date = JSON.parse(key)[1]; return entries.reduce((sum, entry) => sum + Math.max(0, Math.min(entry.end_ms ?? now, midnight(date) + 86400000) - Math.max(entry.start_ms, midnight(date))), 0) > 43200000; });
            return json({ saved: true, count: rows.length, message: `${rows.length} task${rows.length === 1 ? '' : 's'} uploaded.`, warning: longDay ? 'More than 12 hours are logged in a Manila day. Please review your entries.' : null });
        }
        if (path === 'task-status' && method === 'POST') {
            admin(u);
            const b = z.object({ tasks: z.array(z.object({ id: uid, version: z.number().int().positive() })).min(1).max(100) }).parse(await req.json());
            if (new Set(b.tasks.map(t => t.id)).size !== b.tasks.length) fail('Select each task only once.');
            const statements: any[] = [];
            for (const selected of b.tasks) {
                const task = await one('SELECT * FROM task_entries WHERE id=?', selected.id);
                if (!task) fail('A selected task no longer exists. Refresh before approving.', 404);
                if (task.version !== selected.version) fail('A selected task changed. Refresh before approving.', 409);
                if (!['PENDING', 'RETURNED'].includes(task.status)) fail('Select pending or returned tasks only.', 409);
                await editableWeek(task.user_id, midnight(task.date));
                const after = { ...task, status: 'APPROVED', version: task.version + 1, updated_at: now };
                // The database version guard rejects a concurrent edit and rolls back the batch.
                statements.push(stmt("UPDATE task_entries SET status='APPROVED',version=?,updated_at=? WHERE id=?", after.version, now, task.id), audit(u, 'task_entries', task.id, 'approved', task, after), queue(task.id));
            }
            await DB().batch(statements);
            await safeSync(3);
            return json({ saved: true, message: `${b.tasks.length} task${b.tasks.length === 1 ? '' : 's'} approved.` });
        }
        if (path === 'task-hours/bulk' && method === 'POST') {
            admin(u);
            const b = z.object({ tasks: z.array(z.object({ task_id: uid, signature: z.string().max(100000) }).strict()).min(1).max(100) }).strict().parse(await req.json());
            const ids = b.tasks.map(task => task.task_id);
            if (new Set(ids).size !== ids.length) fail('Select each task only once.');
            const placeholders = ids.map(() => '?').join(',');
            const [tasks, times, reviews] = await Promise.all([
                all(`SELECT * FROM task_entries WHERE id IN (${placeholders})`, ...ids),
                all(`SELECT * FROM time_entries WHERE task_id IN (${placeholders}) ORDER BY id`, ...ids),
                all(`SELECT * FROM task_hour_reviews WHERE task_id IN (${placeholders})`, ...ids),
            ]);
            const statements: any[] = [];
            let approved = 0, alreadyApproved = 0;
            for (const selected of b.tasks) {
                const task = tasks.find(task => task.id === selected.task_id);
                if (!task) fail('A selected task no longer exists. Refresh before approving hours.', 404);
                const linked = times.filter(time => time.task_id === task.id);
                if (!linked.length || linked.some(time => time.end_ms === null) || linked.reduce((sum, time) => sum + time.end_ms - time.start_ms, 0) <= 0) fail(`Task ${task.video_id}: Log hours and stop linked timers before reviewing.`);
                const signature = hoursSignature(task, linked);
                if (signature !== selected.signature) fail(`Task ${task.video_id}: Working time changed. Refresh before approving hours.`, 409);
                const old = reviews.find(review => review.task_id === task.id);
                if (old?.signature === signature && old.status === 'APPROVED') { alreadyApproved++; continue; }
                statements.push(stmt("INSERT INTO task_hour_reviews(task_id,signature,status,reviewed_by,reviewed_at) VALUES(?,?,'APPROVED',?,?) ON CONFLICT(task_id) DO UPDATE SET signature=excluded.signature,status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at", task.id, signature, u.id, now), audit(u, 'task_hours', task.id, 'approve', old, { status: 'APPROVED', signature }), queue(task.id));
                approved++;
            }
            // Validate the complete batch before committing any approvals or audit entries.
            if (statements.length) { await DB().batch(statements); await safeSync(3); }
            return json({ saved: true, approved, already_approved: alreadyApproved });
        }
        if (path === 'task-hours' && method === 'POST') {
            admin(u);
            const b = z.object({ task_id: uid, signature: z.string().max(100000), action: z.enum(['approve', 'return']) }).parse(await req.json());
            const task = await one('SELECT * FROM task_entries WHERE id=?', b.task_id);
            if (!task) fail('Task not found.', 404);
            const times = await all('SELECT * FROM time_entries WHERE task_id=? ORDER BY id', b.task_id);
            if (!times.length || times.some(t => !t.end_ms)) fail('Log hours and stop linked timers before reviewing.');
            const signature = hoursSignature(task, times);
            if (signature !== b.signature) fail('Working time changed. Refresh before reviewing.', 409);
            const status = b.action === 'approve' ? 'APPROVED' : 'RETURNED';
            const old = await one('SELECT * FROM task_hour_reviews WHERE task_id=?', b.task_id);
            await DB().batch([stmt('INSERT INTO task_hour_reviews(task_id,signature,status,reviewed_by,reviewed_at) VALUES(?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET signature=excluded.signature,status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at', b.task_id, signature, status, u.id, now), audit(u, 'task_hours', b.task_id, b.action, old, {status, signature}), queue(b.task_id)]);
            await safeSync(1, b.task_id);
            return json({saved:true});
        }
        if (['tasks/delete', 'time/delete'].includes(path) && method === 'POST') {
            const b = z.object({ id: uid, version: z.number().int().optional() }).parse(await req.json());
            const isTask = path === 'tasks/delete', table = isTask ? 'task_entries' : 'time_entries';
            const transaction = await getClient().transaction('write');
            type LogRow = { id: string; user_id: string; version: number; task_id: string | null; end_ms: number | null; project_id: string; account_id: string; spreadsheet_id?: string; sheet_tab?: string };
            const readAll = async (sql: string, ...args: (string | number)[]) => (await transaction.execute({sql, args})).rows as unknown as LogRow[];
            const readOne = async (sql: string, ...args: (string | number)[]) => (await readAll(sql, ...args))[0];
            try {
                const old = await readOne(`SELECT * FROM ${table} WHERE id=?`, b.id);
                if (!old) fail('Entry not found. Refresh the list.', 404);
                if (u.role !== 'ADMIN' && old.user_id !== u.id) fail('You can only delete your own logs.', 403);
                if (isTask && old.version !== b.version) fail('This entry changed. Refresh before deleting.', 409);
                const linked = isTask ? await readAll('SELECT * FROM time_entries WHERE task_id=?', old.id) : [old];
                if (linked.some(t => t.end_ms === null)) fail('Stop linked timers before deleting.', 409);
                const statements: ReturnType<typeof stmt>[] = [];
                if (isTask) {
                    const target = await readOne("SELECT COALESCE(NULLIF(p.spreadsheet_id,''),(SELECT value FROM settings WHERE key='spreadsheet_id')) AS spreadsheet_id,a.sheet_tab FROM projects p JOIN accounts a ON a.project_id=p.id WHERE p.id=? AND a.id=?", old.project_id, old.account_id);
                    if (target?.spreadsheet_id) statements.push(stmt('INSERT INTO deleted_task_sync(task_id,spreadsheet_id,sheet_tab,updated_at) VALUES(?,?,?,?)', old.id, target.spreadsheet_id, target.sheet_tab || 'Task log', now));
                    for (const t of linked) statements.push(audit(u, 'time_entries', t.id, 'deleted', t, null));
                    statements.push(stmt('DELETE FROM time_entries WHERE task_id=?', old.id), stmt('DELETE FROM task_hour_reviews WHERE task_id=?', old.id), stmt('DELETE FROM sync_jobs WHERE task_id=?', old.id));
                } else if (old.task_id) statements.push(queue(old.task_id));
                statements.push(stmt(`DELETE FROM ${table} WHERE id=?`, old.id), audit(u, table, old.id, 'deleted', old, null));
                await transaction.batch(statements);
                await transaction.commit();
            } catch (error) {
                await transaction.rollback();
                throw error;
            } finally { transaction.close(); }
            await safeSync(3);
            return json({ saved: true, message: isTask ? 'Task and linked working time deleted.' : 'Time entry deleted.' });
        }
        if (path === 'time' && method === 'POST') {
            const b = z.object({ id: uid.optional(), project_id: uid, task_id: uid.nullable().optional(), start_ms: z.number().int(), end_ms: z.number().int(), notes: z.string().max(2000).default('') }).parse(await req.json());
            if (b.end_ms <= b.start_ms || b.end_ms - b.start_ms > 86400000 || b.end_ms > now + 60000)
                fail('Time must be positive, no more than 24 hours, and end no later than now.');
            const p = await assignment(u, b.project_id), old = b.id ? await one('SELECT * FROM time_entries WHERE id=?', b.id) : null;
            if (b.id && !old)
                fail('Time entry not found.', 404);
            if (old && old.user_id !== u.id)
                fail('You can only edit your own working time.', 403);
            if (old?.end_ms === null)
                fail('Stop your timer before editing.');
            await editableWeek(u.id, b.start_ms, b.end_ms);
            if (old)
                await editableWeek(u.id, old.start_ms, old.end_ms);
            if (b.task_id && !await one('SELECT 1 FROM task_entries WHERE id=? AND user_id=? AND project_id=?', b.task_id, u.id, b.project_id))
                fail('Choose your own task in the same project.');
            const linked = b.task_id ? await one('SELECT pay_basis,rate_cents FROM task_entries WHERE id=?', b.task_id) : null;
            const payBasis = old && old.project_id === b.project_id && old.task_id === (b.task_id ?? null) ? old.pay_basis : linked?.pay_basis ?? p.pay_basis;
            const capturedRate = old && old.project_id === b.project_id && old.task_id === (b.task_id ?? null) ? old.rate_cents : linked?.rate_cents ?? p.rate_cents;
            const eid = b.id ?? id();
            const statements = [old ? stmt('UPDATE time_entries SET project_id=?,task_id=?,start_ms=?,end_ms=?,notes=?,rate_cents=?,pay_basis=? WHERE id=?', b.project_id, b.task_id ?? null, b.start_ms, b.end_ms, b.notes, capturedRate, payBasis, eid) : stmt("INSERT INTO time_entries(id,project_id,user_id,task_id,start_ms,end_ms,rate_cents,source,notes,created_at,pay_basis) VALUES(?,?,?,?,?,?,?,'manual',?,?,?)", eid, b.project_id, u.id, b.task_id ?? null, b.start_ms, b.end_ms, capturedRate, b.notes, now, payBasis), audit(u, 'time_entries', eid, old ? 'updated' : 'created', old, b)];
            for (const tid of new Set([old?.task_id, b.task_id].filter(Boolean)))
                statements.push(queue(tid as string));
            await DB().batch(statements);
            await safeSync(3);
            return json({ saved: true, warning: await dailyWarning(u.id, b.start_ms, b.end_ms) });
        }
        if (path === 'timer' && method === 'POST') {
            const b = z.object({ action: z.enum(['start', 'stop']), project_id: uid.optional(), task_id: uid.nullable().optional() }).parse(await req.json());
            const active = await one('SELECT * FROM time_entries WHERE user_id=? AND end_ms IS NULL', u.id);
            if (b.action === 'start') {
                if (active)
                    fail('You already have a running timer.', 409);
                const p = await assignment(u, b.project_id!);
                if (p.time_tracking_enabled !== 1) fail('Time tracking is disabled for this project. Ask an administrator to enable it in project settings.', 403);
                await editableWeek(u.id, now);
                if (b.task_id && !await one('SELECT 1 FROM task_entries WHERE id=? AND user_id=? AND project_id=?', b.task_id, u.id, p.id))
                    fail('Choose your own task in this project.');
                const linked = b.task_id ? await one('SELECT pay_basis,rate_cents FROM task_entries WHERE id=?', b.task_id) : null;
                const eid = id();
                await DB().batch([stmt("INSERT INTO time_entries(id,project_id,user_id,task_id,start_ms,end_ms,rate_cents,source,notes,created_at,pay_basis) VALUES(?,?,?,?,?,NULL,?,'timer','',?,?)", eid, p.id, u.id, b.task_id ?? null, now, linked?.rate_cents ?? p.rate_cents, now, linked?.pay_basis ?? p.pay_basis), audit(u, 'time_entries', eid, 'timer_started', null, { project_id: p.id, task_id: b.task_id ?? null })]);
                return json({ saved: true });
            }
            if (!active)
                fail('No timer is running.');
            await editableWeek(u.id, active.start_ms, now);
            const statements = [stmt('UPDATE time_entries SET end_ms=? WHERE id=? AND end_ms IS NULL', now, active.id), audit(u, 'time_entries', active.id, 'timer_stopped', active, { end_ms: now })];
            if (active.task_id)
                statements.push(queue(active.task_id));
            await DB().batch(statements);
            await safeSync(3);
            return json({ saved: true, warning: await dailyWarning(u.id, active.start_ms, now) });
        }
        if (path === 'timesheets' && method === 'POST') {
            const b = z.object({ week_start: date, user_id: uid.optional(), action: z.enum(['submit', 'approve', 'return']), comment: z.string().max(2000).default('') }).parse(await req.json());
            if (weekStart(b.week_start) !== b.week_start)
                fail('Weeks must start on Monday.');
            const who = b.action === 'submit' ? u.id : b.user_id!;
            if (b.action !== 'submit')
                admin(u);
            const start = midnight(b.week_start), end = start + 7 * 86400000, old = await one('SELECT * FROM timesheets WHERE user_id=? AND week_start=?', who, b.week_start);
            if (b.action === 'submit') {
                if (old && ['SUBMITTED', 'APPROVED'].includes(old.status))
                    fail('This week has already been submitted.', 409);
                if (await one('SELECT 1 FROM time_entries WHERE user_id=? AND end_ms IS NULL AND start_ms<?', who, end))
                    fail('Stop the timer before submitting.');
                if (!await one('SELECT 1 FROM time_entries WHERE user_id=? AND start_ms<? AND end_ms>?', who, end, start))
                    fail('Log working time before submitting.');
            }
            else {
                if (!old)
                    fail('Timesheet not found.', 404);
                if (b.action === 'approve' && old.status !== 'SUBMITTED')
                    fail('Only submitted timesheets can be approved.');
                if (b.action === 'return' && !b.comment.trim())
                    fail('Add a comment explaining what needs to change.');
            }
            const status = b.action === 'submit' ? 'SUBMITTED' : b.action === 'approve' ? 'APPROVED' : 'RETURNED', eid = old?.id ?? id();
            await DB().batch([stmt('INSERT INTO timesheets(id,user_id,week_start,start_ms,end_ms,status,comment,reviewed_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,week_start) DO UPDATE SET status=excluded.status,comment=excluded.comment,reviewed_by=excluded.reviewed_by,updated_at=excluded.updated_at', eid, who, b.week_start, start, end, status, b.comment, b.action === 'submit' ? null : u.id, now), audit(u, 'timesheets', eid, b.action, old, { status, comment: b.comment })]);
            return json({ saved: true });
        }
        if (path === 'projects' && method === 'POST') {
            admin(u);
            const b = z.object({ id: uid.optional(), time_tracking_enabled: z.number().int().min(0).max(1).optional(), name, description: z.string().max(3000).default(''), status: z.enum(['active', 'archived']), pay_basis: z.enum(['TASK','VIDEO_HOUR','WORKING_HOUR']).default('WORKING_HOUR'), spreadsheet_id: z.string().regex(/^[a-zA-Z0-9_-]*$/).max(200).default(''), hourly_target: z.number().int().min(0).max(10000).nullable(), rate_cents: z.number().int().min(0).max(10000000), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#647c45'), employee_ids: z.array(uid) }).parse(await req.json());
            const eid = b.id ?? id(), old = await one('SELECT p.*,COALESCE(s.enabled,0) AS time_tracking_enabled FROM projects p LEFT JOIN project_time_tracking s ON s.project_id=p.id WHERE p.id=?', eid);
            if (b.id && await one("SELECT 1 FROM deleted_records WHERE entity='projects' AND entity_id=?", b.id)) fail('Restore this deleted record before editing it.',409);
            if (b.id && !old)
                fail('Project not found.', 404);
            const timeTracking = b.time_tracking_enabled ?? old?.time_tracking_enabled ?? 0;
            const ss = [stmt('INSERT INTO projects(id,name,description,status,hourly_target,rate_cents,color,pay_basis,spreadsheet_id) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,status=excluded.status,hourly_target=excluded.hourly_target,rate_cents=excluded.rate_cents,color=excluded.color,pay_basis=excluded.pay_basis,spreadsheet_id=excluded.spreadsheet_id', eid, b.name, b.description, b.status, b.hourly_target, b.rate_cents, b.color, b.pay_basis, b.spreadsheet_id), stmt('DELETE FROM project_assignments WHERE project_id=?', eid), ...b.employee_ids.map(w => stmt('INSERT INTO project_assignments(project_id,user_id) VALUES(?,?)', eid, w)), stmt('INSERT INTO project_time_tracking(project_id,enabled) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET enabled=excluded.enabled', eid, timeTracking), audit(u, 'projects', eid, old ? 'updated' : 'created', old, { ...b, time_tracking_enabled: timeTracking })];
            ss.push(stmt("INSERT INTO sync_jobs(task_id,status,updated_at) SELECT id,'pending',? FROM task_entries WHERE project_id=? ON CONFLICT(task_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at", now, eid));
            await DB().batch(ss);
            await safeSync(3);
            return json({ saved: true, id: eid });
        }
        if (path === 'accounts' && method === 'POST') {
            admin(u);
            const b = z.object({ id: uid.optional(), project_id: uid, name, active: z.number().int().min(0).max(1), sheet_tab: z.string().max(100).default(''), employee_ids: z.array(uid) }).parse(await req.json());
            const eid = b.id ?? id(), old = await one('SELECT * FROM accounts WHERE id=?', eid);
            if (old && old.project_id !== b.project_id)
                fail('An account cannot move between projects.');
            if (b.id && !old)
                fail('Account not found.', 404);
            for (const who of b.employee_ids)
                if (!await one('SELECT 1 FROM project_assignments WHERE project_id=? AND user_id=?', b.project_id, who))
                    fail('Assign employees to the project before assigning its accounts.');
            await DB().batch([stmt('INSERT INTO accounts(id,project_id,name,active,sheet_tab) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,sheet_tab=excluded.sheet_tab', eid, b.project_id, b.name, b.active, b.sheet_tab), stmt('DELETE FROM account_assignments WHERE account_id=?', eid), ...b.employee_ids.map(w => stmt('INSERT INTO account_assignments(account_id,user_id) VALUES(?,?)', eid, w)), audit(u, 'accounts', eid, old ? 'updated' : 'created', old, b), stmt("INSERT INTO sync_jobs(task_id,status,updated_at) SELECT id,'pending',? FROM task_entries WHERE account_id=? ON CONFLICT(task_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at", now, eid)]);
            await safeSync(3);
            return json({ saved: true });
        }
        if (path === 'users' && method === 'POST') {
            admin(u);
            const b = z.object({ id: uid.optional(), name, email, role: z.enum(['ADMIN', 'EMPLOYEE']), active: z.number().int().min(0).max(1), password: z.string().optional() }).parse(await req.json());
            const eid = b.id ?? id(), old = await one('SELECT id,name,email,role,active FROM users WHERE id=?', eid);
            if (b.id && await one("SELECT 1 FROM deleted_records WHERE entity='users' AND entity_id=?", b.id)) fail('Restore this deleted record before editing it.',409);
            if (b.id && !old)
                fail('Employee not found.', 404);
            if (eid === u.id && (b.role !== 'ADMIN' || !b.active))
                fail('You cannot remove your own administrator access.');
            if (b.password)
                password.parse(b.password);
            if (!old && !b.password && !config('GOOGLE_CLIENT_ID'))
                fail('Provide an initial password, or configure Google sign-in.');
            const hash = b.password ? await hashPassword(b.password) : null;
            const ss = [stmt('INSERT INTO users(id,name,email,role,active,password_hash,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,role=excluded.role,active=excluded.active,password_hash=COALESCE(excluded.password_hash,users.password_hash),google_sub=CASE WHEN excluded.email!=users.email THEN NULL ELSE users.google_sub END', eid, b.name, b.email, b.role, b.active, hash, now), audit(u, 'users', eid, old ? 'updated' : 'created', old, { name: b.name, email: b.email, role: b.role, active: b.active })];
            ss.push(stmt("INSERT INTO sync_jobs(task_id,status,updated_at) SELECT id,'pending',? FROM task_entries WHERE user_id=? ON CONFLICT(task_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at", now, eid));
            if (old)
                ss.push(stmt('DELETE FROM sessions WHERE user_id=?', eid));
            await DB().batch(ss);
            await safeSync(3);
            return json({ saved: true });
        }
        if (path === 'audit' && method === 'GET') {
            const task = new URL(req.url).searchParams.get('task');
            if (u.role !== 'ADMIN' && (!task || !await one('SELECT 1 FROM task_entries WHERE id=? AND user_id=?', task, u.id)))
                fail('Access denied.', 403);
            return json(await all('SELECT a.*,u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id' + (task ? ' WHERE a.entity_id=?' : '') + ' ORDER BY a.created_at DESC LIMIT 200', ...(task ? [task] : [])));
        }
        if (path === 'settings' && method === 'POST') {
            admin(u);
            const b = z.object({ spreadsheet_id: z.string().regex(/^[a-zA-Z0-9_-]*$/).max(200) }).parse(await req.json());
            await DB().batch([stmt("INSERT INTO settings(key,value) VALUES('spreadsheet_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", b.spreadsheet_id), audit(u, 'settings', 'spreadsheet_id', 'updated', null, b), stmt("INSERT INTO sync_jobs(task_id,status,updated_at) SELECT id,'pending',? FROM task_entries WHERE 1 ON CONFLICT(task_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at", now)]);
            await safeSync(3);
            return json({ saved: true });
        }
        if (path === 'sync' && method === 'POST') {
            admin(u);
            const result = await safeSync(3);
            const sync = await all("SELECT task_id,status,last_error,updated_at FROM sync_jobs UNION ALL SELECT task_id,CASE WHEN last_error IS NULL THEN 'pending' ELSE 'error' END,last_error,updated_at FROM deleted_task_sync");
            return json({ ...result, sync });
        }
        if (path === 'export' && method === 'GET') {
            const data = await snapshot(u), q = new URL(req.url).searchParams, from = q.get('from') || '1970-01-01', to = q.get('to') || '2100-01-01', kind = q.get('kind') || 'tasks';
            midnight(from);
            midnight(to);
            const person = (x: string) => data.users.find((p: any) => p.id === x)?.name ?? '', project = (x: string) => data.projects.find((p: any) => p.id === x)?.name ?? '', account = (x: string) => data.accounts.find((p: any) => p.id === x)?.name ?? '';
            const tasks = data.tasks.filter((t: any) => t.date >= from && t.date <= to && (!q.get('project') || t.project_id === q.get('project')) && (!q.get('employee') || t.user_id === q.get('employee')) && (!q.get('account') || t.account_id === q.get('account')) && (!q.get('status') || t.status === q.get('status')) && (!q.get('search') || [t.video_id, t.notes, person(t.user_id), account(t.account_id)].join(' ').toLowerCase().includes(q.get('search')!.toLowerCase())));
            let rows: any[][] = [['DATE', 'VIDEO ID', 'DURATION (h:mm:ss)', 'STATUS', 'ANNOTATOR', 'PROJECT', 'ACCOUNT', 'TIME SPENT (h:mm:ss)', 'NOTES'], ...tasks.map((t: any) => [t.date, t.video_id, duration(t.duration_seconds), t.status, person(t.user_id), project(t.project_id), account(t.account_id), duration(t.spent_seconds), t.notes])];
            if (kind === 'timesheets') {
                rows = [['DATE', 'ANNOTATOR', 'PROJECT', 'START (Asia/Manila)', 'END (Asia/Manila)', 'HOURS', 'HOURLY RATE (PHP)', 'GROSS PAY (PHP)', 'TIMESHEET STATUS']];
                for (const t of data.times) {
                    if (!t.end_ms || q.get('employee') && q.get('employee') !== t.user_id || q.get('project') && q.get('project') !== t.project_id || q.get('account') && !data.tasks.some((r: any) => r.id === t.task_id && r.account_id === q.get('account')) || q.get('status') && !data.tasks.some((r: any) => r.id === t.task_id && r.status === q.get('status')))
                        continue;
                    for (const d of splitDays(t.start_ms, t.end_ms)) {
                        if (d.date < from || d.date > to)
                            continue;
                        const status = data.sheets.find((s: any) => s.user_id === t.user_id && s.week_start === weekStart(d.date))?.status ?? 'DRAFT';
                        rows.push([d.date, person(t.user_id), project(t.project_id), new Date(Math.max(t.start_ms, midnight(d.date)) + 28800000).toISOString().slice(0, 19), new Date(Math.min(t.end_ms, midnight(addDays(d.date, 1))) + 28800000).toISOString().slice(0, 19), Number((d.seconds / 3600).toFixed(4)), t.rate_cents / 100, Number((d.seconds / 3600 * t.rate_cents / 100).toFixed(2)), status]);
                    }
                }
            }
            if (kind === 'payroll') {
                const pay = payrollRows(data, Object.fromEntries(q));
                rows = [['DATE','EMPLOYEE','PROJECT','TASK ID','PAY BASIS','UNITS','RATE (PHP)','ESTIMATED PAY (PHP)','UNPAID APPROVED PAY (PHP)','PAID (PHP)','STATUS','PAYMENT STATUS','INVOICE ID'], ...pay.map((r: any) => [r.date,person(r.user_id),project(r.project_id),data.tasks.find((t:any)=>t.id===r.task_id)?.video_id ?? '',PAY_BASES[r.pay_basis as keyof typeof PAY_BASES],r.units,r.rate_cents/100,Math.round(r.cents)/100,r.paid_invoice_id?0:Math.round(r.approved_cents)/100,r.paid_invoice_id?Math.round(r.cents)/100:0,r.status,r.paid_invoice_id?'PAID':'UNPAID',r.paid_invoice_id??''])];
            }
            const summary = [['STATUS', 'TASK COUNT'], ...STATUSES.map(s => [s, tasks.filter((t: any) => t.status === s).length])];
            const isXlsx = q.get('format') === 'xlsx', body = isXlsx ? xlsx([{ name: kind === 'tasks' ? 'Task logs' : 'Working time', rows }, ...(kind === 'tasks' ? [{ name: 'Status summary', rows: summary }] : [])]) : csv(rows);
            return new Response(body, { headers: { 'Content-Type': isXlsx ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv;charset=utf-8', 'Content-Disposition': `attachment; filename="aces-${kind}-${day()}.${isXlsx ? 'xlsx' : 'csv'}"`, 'Cache-Control': 'no-store' } });
        }
        fail('Route not found.', 404);
    }
    catch (error: any) {
        if (error instanceof z.ZodError)
            return json({ error: error.issues.map(i => i.message).join(' ') }, 400);
        const message = String(error.message ?? '');
        if (message.startsWith('Use h:mm:ss') || message === 'Invalid date')
            return json({ error: message }, 400);
        if (message.includes('SQLITE_BUSY') || message.includes('SQLITE_LOCKED'))
            return json({ error: 'Another payment or edit is in progress. Refresh and try again.' }, 409);
        if (message.includes('paid_work_locked') || message.includes('invoice_immutable'))
            return json({ error: 'This work has been paid and is locked. Payment records cannot be edited.' }, 409);
        if (message.includes('time_tracking_disabled'))
            return json({ error: 'Time tracking is disabled for this project. Ask an administrator to enable it in project settings.' }, 403);
        if (message.includes('running_timer'))
            return json({ error: 'Stop your timer before submitting this week.' }, 409);
        if (message.includes('overlapping_time'))
            return json({ error: 'This time overlaps another entry or running timer.' }, 409);
        if (message.includes('week_locked'))
            return json({ error: 'This timesheet is submitted or approved. Return it before editing.' }, 409);
        if (message.includes('stale_task'))
            return json({ error: 'This task changed. Refresh and try again.' }, 409);
        if (message.includes('UNIQUE constraint failed'))
            return json({ error: 'This record already exists. Refresh to view the existing entry.', duplicate: message.includes('task_entries') }, 409);
        if (error.status)
            return json({ error: message, existing_id: error.existing_id, duplicate: error.duplicate }, error.status);
        console.error('Workhub request failed:', message.slice(0, 300));
        return json({ error: 'The request could not be completed. Please try again.' }, 500);
    }
}
