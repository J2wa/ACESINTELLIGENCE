import { all, one, stmt, config, token } from './auth';
import { duration } from './core.mjs';
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
    const setting = await one("SELECT value FROM settings WHERE key='spreadsheet_id'");
    if (!setting?.value)
        return { synced: 0, pending: true, message: 'Configure the tracker spreadsheet in Settings.' };
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
        const jobs = await all("SELECT j.*,t.date,t.video_id,t.duration_seconds,t.status AS task_status,t.notes,u.name AS annotator,p.name AS project,a.name AS account,a.sheet_tab,(SELECT COALESCE(SUM((end_ms-start_ms)/1000),0) FROM time_entries WHERE task_id=t.id AND end_ms IS NOT NULL) AS spent FROM sync_jobs j JOIN task_entries t ON t.id=j.task_id JOIN users u ON u.id=t.user_id JOIN projects p ON p.id=t.project_id JOIN accounts a ON a.id=t.account_id WHERE j.status!='synced' AND (? IS NULL OR j.task_id=?) ORDER BY j.updated_at LIMIT ?", taskId ?? null, taskId ?? null, limit);
        for (const j of jobs) {
            try {
                if (!j.sheet_tab)
                    throw new Error('Choose a tracker tab for this work account.');
                const range = "'" + j.sheet_tab.replaceAll("'", "''") + "'", base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(setting.value)}/values/`, headers = { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };
                const r = await fetch(base + encodeURIComponent(range + '!A:J'), { headers, signal: AbortSignal.timeout(10000) });
                if (!r.ok)
                    throw new Error('Unable to read tracker tab. Check sharing and tab name.');
                const values = (await r.json() as any).values ?? [], index = values.findIndex((v: any[]) => v[9] === j.task_id);
                const required = ['PROJECT', 'ACCOUNT', 'TIME SPENT', 'NOTES', 'WORKHUB ID'];
                if (!required.every((h, i) => String(values[0]?.[i + 5] ?? '').toUpperCase().trim() === h))
                    throw new Error('Prepare tracker columns F–J: PROJECT, ACCOUNT, TIME SPENT, NOTES, WORKHUB ID. Existing columns are protected until headers match.');
                const row = [j.date, j.video_id, duration(j.duration_seconds), j.task_status, j.annotator, j.project, j.account, duration(j.spent), j.notes, j.task_id];
                const target = index >= 0 ? base + encodeURIComponent(range + `!A${index + 1}:J${index + 1}`) + '?valueInputOption=RAW' : base + encodeURIComponent(range + '!A:J') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
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
        const pending = !!await one("SELECT task_id FROM sync_jobs WHERE status!='synced' LIMIT 1");
        return { synced, pending, message: `Synced ${synced} ${synced === 1 ? 'row' : 'rows'}.${pending ? ' More entries are queued or need attention in Settings.' : ' All caught up.'}` };
    }
    finally {
        await stmt("DELETE FROM settings WHERE key='sync_lock' AND value=?", `${now + 120000}:${lock}`).run();
    }
}
