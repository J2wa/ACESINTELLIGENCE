import type { Transaction } from '@libsql/client';
import { getClient } from './database';
import { audit, fail, stmt } from './auth';
import { day, midnight, parseDuration } from './core.mjs';
type User = {id:string;role:string};
type LogRow = {id:string;user_id:string;version:number;date:string;status:string;project_id:string;account_id:string;video_id:string;pay_basis:string;start_ms:number;end_ms:number|null;spreadsheet_id:string|null;sheet_tab:string|null};
type EditInput = {id?:string;version?:number;project_id:string;account_id:string;user_id?:string;status:string;minutes:number;date:string;video_id:string;duration?:string;notes:string};
const read = async (tx: Transaction, sql: string, ...args: (string | number)[]) => (await tx.execute({sql,args})).rows as unknown as LogRow[];
const one = async (tx: Transaction, sql: string, ...args: (string | number)[]) => (await read(tx,sql,...args))[0];
async function unlocked(tx: Transaction, task: LogRow, user: User, version: number | undefined, deleting: boolean) {
    if (user.role !== 'ADMIN' && task.user_id !== user.id) fail('You can only change your own tasks.',403);
    if (task.version !== version) fail('This task changed; refresh and retry.',409);
    if ((deleting || user.role !== 'ADMIN') && task.status === 'APPROVED') fail('This task is already approved.',409);
    // Normal deletion has the same safeguards for administrators and employees.
    if (await one(tx,'SELECT 1 FROM payment_tasks WHERE task_id=? UNION ALL SELECT 1 FROM payment_invoice_items WHERE task_id=?',task.id,task.id)) fail('This task is included in an invoice.',409);
    if (deleting && task.date.slice(0,7) !== day().slice(0,7)) fail('This task is outside the current Manila month.',409);
    const linked = await read(tx,'SELECT * FROM time_entries WHERE task_id=?',task.id);
    for (const t of linked) {
        if (await one(tx,'SELECT 1 FROM payment_times WHERE time_entry_id=? UNION ALL SELECT 1 FROM payment_invoice_items WHERE time_entry_id=?',t.id,t.id)) fail('Linked working time is included in an invoice.',409);
        if (t.end_ms === null) fail('Stop linked timers before changing this task.',409);
        await unlockedWeek(tx,t.user_id,t.start_ms,t.end_ms!);
    }
    if (await one(tx,"SELECT 1 FROM task_hour_reviews WHERE task_id=? AND status='APPROVED'",task.id)) fail('This task has approved working hours.',409);
    await unlockedWeek(tx,task.user_id,midnight(task.date),midnight(task.date)+1);
    return linked;
}
async function unlockedWeek(tx: Transaction,user: string,start: number,end: number) {
    if (await one(tx,"SELECT 1 FROM timesheets WHERE user_id=? AND status IN ('SUBMITTED','APPROVED') AND start_ms<? AND end_ms>?",user,end,start)) fail('This week is locked. Ask your coordinator to return the timesheet.',409);
}
async function removal(tx: Transaction,task: LogRow) {
    // A pending move must finish before another move/deletion can replace its destination.
    if (await one(tx,'SELECT 1 FROM deleted_task_sync WHERE task_id=?',task.id)) fail('Previous spreadsheet removal is still queued. Retry after sync finishes.',409);
    const target = await one(tx,"SELECT COALESCE(NULLIF(p.spreadsheet_id,''),(SELECT value FROM settings WHERE key='spreadsheet_id')) AS spreadsheet_id,a.sheet_tab FROM projects p JOIN accounts a ON a.project_id=p.id WHERE p.id=? AND a.id=?",task.project_id,task.account_id);
    if (target?.spreadsheet_id) await tx.execute(stmt('INSERT INTO deleted_task_sync(task_id,spreadsheet_id,sheet_tab,updated_at) VALUES(?,?,?,?)',task.id,target.spreadsheet_id,target.sheet_tab||'Task log',Date.now()));
}
export async function deleteTasks(user: User, tasks: {id:string;version:number}[]) {
    if (new Set(tasks.map(t=>t.id)).size !== tasks.length) fail('Select each task only once.');
    const tx = await getClient().transaction('write');
    try {
        for (const selected of tasks) {
            const old = await one(tx,'SELECT * FROM task_entries WHERE id=?',selected.id);
            if (!old) fail('Task not found. Refresh the list.',404);
            let linked;
            try { linked = await unlocked(tx,old,user,selected.version,true); }
            catch(error) { (error as Error).message = `Task ${old.video_id}: ${(error as Error).message}`; throw error; }
            await removal(tx,old);
            for (const t of linked) await tx.execute(audit(user,'time_entries',t.id,'deleted',t,null));
            await tx.batch([stmt('DELETE FROM time_entries WHERE task_id=?',old.id),stmt('DELETE FROM task_hour_reviews WHERE task_id=?',old.id),stmt('DELETE FROM sync_jobs WHERE task_id=?',old.id),stmt('DELETE FROM task_entries WHERE id=?',old.id),audit(user,'task_entries',old.id,'deleted',old,null)]);
        }
        await tx.commit();
    } catch(error) { await tx.rollback(); throw error; } finally { tx.close(); }
}
export async function editTask(user: User,b: EditInput) {
    if (!b.id) fail('Task ID is required.');
    const tx = await getClient().transaction('write');
    try {
        const old = await one(tx,'SELECT * FROM task_entries WHERE id=?',b.id!);
        if (!old) fail('Task not found.',404);
        await unlocked(tx,old,user,b.version,false);
        if (b.project_id !== old.project_id) fail('Project cannot change on an existing task.');
        if (b.user_id && b.user_id !== old.user_id) fail('The annotator cannot change on an existing task.');
        if (user.role !== 'ADMIN' && !['PENDING','SKIPPED (NO CHANGES)'].includes(b.status)) fail('Only coordinators can approve or return tasks.',403);
        if (b.minutes > 0) fail('Edit working time in Timesheets to avoid double counting.');
        if (!await one(tx,"SELECT 1 FROM projects p JOIN accounts a ON a.project_id=p.id WHERE p.id=? AND p.status='active' AND a.id=? AND a.active=1 AND NOT EXISTS(SELECT 1 FROM deleted_work_accounts WHERE account_id=a.id) AND NOT EXISTS(SELECT 1 FROM deleted_records WHERE entity='projects' AND entity_id=p.id)",b.project_id,b.account_id)) fail('Choose an active account for this project.');
        if (user.role !== 'ADMIN' && (!await one(tx,'SELECT 1 FROM account_assignments WHERE account_id=? AND user_id=?',b.account_id,user.id) || !await one(tx,'SELECT 1 FROM project_assignments WHERE project_id=? AND user_id=?',b.project_id,user.id))) fail('You are not assigned to this account or project.',403);
        await unlockedWeek(tx,old.user_id,midnight(b.date),midnight(b.date)+1);
        if (await one(tx,'SELECT 1 FROM task_entries WHERE project_id=? AND account_id=? AND video_id=? AND id!=?',b.project_id,b.account_id,b.video_id,b.id!)) fail('This task ID already exists in this project and account.',409);
        if (old.account_id !== b.account_id) await removal(tx,old);
        const seconds = old.pay_basis === 'VIDEO_HOUR' ? parseDuration(b.duration) : 0;
        const after = {...old,date:b.date,account_id:b.account_id,video_id:b.video_id,duration_seconds:seconds,status:b.status,notes:b.notes,version:old.version+1,updated_at:Date.now()};
        await tx.batch([stmt('UPDATE task_entries SET date=?,account_id=?,video_id=?,duration_seconds=?,status=?,notes=?,version=?,updated_at=? WHERE id=?',after.date,after.account_id,after.video_id,seconds,after.status,after.notes,after.version,after.updated_at,old.id),audit(user,'task_entries',old.id,'updated',old,after),stmt("INSERT INTO sync_jobs(task_id,status,updated_at) VALUES(?,'pending',?) ON CONFLICT(task_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at",old.id,Date.now())]);
        await tx.commit();
    } catch(error) { await tx.rollback(); throw error; } finally {tx.close();}
}
