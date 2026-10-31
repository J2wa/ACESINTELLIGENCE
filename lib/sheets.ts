import { all, one, stmt, config, token } from './auth';
import { duration, taskHours, payrollRows } from './core.mjs';
import { ensureLogSchema } from './log-schema';
import { TRACKER_HEADERS } from './tracker.mjs';
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
async function accessToken() {
    const account = JSON.parse(config('GOOGLE_SERVICE_ACCOUNT_JSON') || '{}');
    if (!account.client_email || !account.private_key)
        throw new Error('Google service account is not configured.');
    const enc = new TextEncoder(), now = Math.floor(Date.now() / 1000), header = b64(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))), claim = b64(enc.encode(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
    const pem = account.private_key.replace(/-----[^-]+-----|\s/g, ''), key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c: string) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sign = b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(header + '.' + claim))));
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: header + '.' + claim + '.' + sign }), signal: AbortSignal.timeout(10000) });
    if (!r.ok)
        throw new Error('Google service account authorization failed.');
    return (await r.json() as any).access_token;
}
export async function syncTasks(limit = 1, taskId?: string) {
    await ensureLogSchema();
    const setting = await one("SELECT value FROM settings WHERE key='spreadsheet_id'");
    if (!setting?.value && !await one("SELECT id FROM projects WHERE spreadsheet_id!='' LIMIT 1") && !await one("SELECT task_id FROM deleted_task_sync LIMIT 1"))
        return { synced: 0, pending: true, message: 'Configure a project or workspace spreadsheet.' };
    const lock = token(), now = Date.now();
    await stmt("INSERT INTO settings(key,value) VALUES('sync_lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(substr(settings.value,1,13) AS INTEGER)<?", `${now + 120000}:${lock}`, now).run();
    if ((await one("SELECT value FROM settings WHERE key='sync_lock'"))?.value !== `${now + 120000}:${lock}`)
        return { synced: 0, pending: true, message: 'Sync already in progress.' };
    let synced = 0;
    try {
        let bearer: string;
        try { bearer = await accessToken(); } catch {
            const message = 'Google Sheets authorization is unavailable. Check the service-account secret and Sheets API configuration.';
            await stmt("UPDATE sync_jobs SET status='error',last_error=? WHERE status!='synced' AND (? IS NULL OR task_id=?)", message, taskId ?? null, taskId ?? null).run();
            return { synced: 0, pending: true, message };
        }
        const deletions = await all('SELECT * FROM deleted_task_sync ORDER BY updated_at LIMIT ?', limit);
        for (const job of deletions) {
            try {
                const range = "'" + job.sheet_tab.replaceAll("'", "''") + "'";
                const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(job.spreadsheet_id)}/values/`;
                const headers = { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };
                const response = await fetch(base + encodeURIComponent(range + '!A:P'), { headers, signal: AbortSignal.timeout(10000) });
                if (!response.ok) throw new Error('Cannot read tracker to remove deleted task.');
                const values = (await response.json() as { values?: unknown[][] }).values ?? [];
                // Clear by stable entry ID, never by a stored row number or user-entered task ID.
                for (let index = 1; index < values.length; index++) {
                    if (values[index][9] !== job.task_id) continue;
                    const cleared = await fetch(base + encodeURIComponent(range + `!A${index + 1}:P${index + 1}`) + ':clear', { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(10000) });
                    if (!cleared.ok) throw new Error('Could not remove deleted task from tracker.');
                }
                await stmt('DELETE FROM deleted_task_sync WHERE task_id=?', job.task_id).run();
                synced++;
            } catch (error) {
                await stmt('UPDATE deleted_task_sync SET last_error=? WHERE task_id=?', (error as Error).message, job.task_id).run();
            }
        }
        const jobs = await all("SELECT j.*,t.date,t.video_id,t.duration_seconds,t.status AS task_status,t.notes,u.name AS annotator,p.name AS project,p.spreadsheet_id,a.name AS account,a.sheet_tab,t.user_id,t.project_id,t.account_id,t.pay_basis,t.rate_cents,t.updated_at AS task_updated_at,(SELECT COALESCE(SUM((end_ms-start_ms)/1000),0) FROM time_entries WHERE task_id=t.id AND end_ms IS NOT NULL) AS spent FROM sync_jobs j JOIN task_entries t ON t.id=j.task_id JOIN users u ON u.id=t.user_id JOIN projects p ON p.id=t.project_id JOIN accounts a ON a.id=t.account_id WHERE j.status!='synced' AND (? IS NULL OR j.task_id=?) ORDER BY j.updated_at LIMIT ?", taskId ?? null, taskId ?? null, limit);
        for (const j of jobs) {
            try {
                const spreadsheet = j.spreadsheet_id || setting?.value;
                if (!spreadsheet) throw new Error('Configure a spreadsheet for this project.');
                const tabName = j.sheet_tab || 'Task log';
                const range = "'" + tabName.replaceAll("'", "''") + "'", root = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheet)}`, base = root + '/values/', headers = { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };
                const meta = await fetch(root + '?fields=sheets.properties', {headers, signal:AbortSignal.timeout(10000)});
                if (!meta.ok) throw new Error('Cannot access the spreadsheet. Share it with the configured service account as Editor.');
                const tabs = (await meta.json() as any).sheets ?? [];
                if (!tabs.some((s:any)=>s.properties.title===tabName)) {
                    const add = await fetch(root + ':batchUpdate', {method:'POST',headers,body:JSON.stringify({requests:[{addSheet:{properties:{title:tabName,gridProperties:{frozenRowCount:1}}}}]}),signal:AbortSignal.timeout(10000)});
                    if (!add.ok) throw new Error('Could not create the tracker tab.');
                }
                const r = await fetch(base + encodeURIComponent(range + '!A:P'), { headers, signal: AbortSignal.timeout(10000) });
                if (!r.ok)
                    throw new Error('Unable to read tracker tab. Check sharing and tab name.');
                const values = (await r.json() as any).values ?? [], index = values.findIndex((v: any[]) => v[9] === j.task_id);
                if (!values.length) {
                    const init = await fetch(base + encodeURIComponent(range+'!A1:P1')+'?valueInputOption=RAW',{method:'PUT',headers,body:JSON.stringify({values:[TRACKER_HEADERS]}),signal:AbortSignal.timeout(10000)});
                    if (!init.ok) throw new Error('Could not initialize tracker headers.');
                } else if (!TRACKER_HEADERS.every((h,i)=>String(values[0]?.[i]??'').toUpperCase().trim()===h)) {
                    throw new Error('Tracker headers do not match. Use a new empty tab to protect existing spreadsheet data.');
                }
                const times = await all('SELECT * FROM time_entries WHERE task_id=?',j.task_id);
                const task = taskHours({...j,id:j.task_id,status:j.task_status},times,await one('SELECT * FROM task_hour_reviews WHERE task_id=?',j.task_id), await all('SELECT * FROM timesheets WHERE user_id=?',j.user_id));
                const pay = payrollRows({tasks:[task],times,sheets:[]});
                const row = [j.date, j.video_id, duration(j.duration_seconds), j.task_status, j.annotator, j.project, j.account, duration(task.spent_seconds), j.notes, j.task_id, task.hours_status, j.pay_basis, j.rate_cents/100, Math.round(pay.reduce((s:number,r:any)=>s+r.cents,0))/100, Math.round(pay.reduce((s:number,r:any)=>s+r.approved_cents,0))/100, new Date(j.task_updated_at).toISOString()];
                const target = index >= 0 ? base + encodeURIComponent(range + `!A${index + 1}:P${index + 1}`) + '?valueInputOption=RAW' : base + encodeURIComponent(range + '!A:P') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
                const w = await fetch(target, { method: index >= 0 ? 'PUT' : 'POST', headers, body: JSON.stringify({ values: [row] }), signal: AbortSignal.timeout(10000) });
                if (!w.ok)
                    throw new Error('Google Sheets rejected the row. Check editor permissions.');
                await stmt("UPDATE sync_jobs SET status='synced',last_error=NULL,attempts=attempts+1 WHERE task_id=? AND updated_at=?", j.task_id, j.updated_at).run();
                synced++;
            }
            catch (e) {
                await stmt("UPDATE sync_jobs SET status='error',last_error=?,attempts=attempts+1 WHERE task_id=? AND updated_at=?", (e as Error).message, j.task_id, j.updated_at).run();
            }
        }
        const pending = !!await one("SELECT task_id FROM sync_jobs WHERE status!='synced' UNION ALL SELECT task_id FROM deleted_task_sync LIMIT 1");
        return { synced, pending, message: `Synced ${synced} ${synced === 1 ? 'row' : 'rows'}.${pending ? ' More entries are queued or need attention in Settings.' : ' All caught up.'}` };
    }
    finally {
        await stmt("DELETE FROM settings WHERE key='sync_lock' AND value=?", `${now + 120000}:${lock}`).run();
    }
}
