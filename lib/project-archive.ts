import { getClient } from './database';
import { authorizeArchivePurge, ensureArchiveExportSchema } from './archive-export';
import { fail, id } from './auth';

export async function projectArchive(actor: {id:string;role:string}, action:'archive'|'restore'|'empty', ids:string[], receipt?:string) {
    if (actor.role !== 'ADMIN') fail('Admin access required.',403);
    await ensureArchiveExportSchema();
    const tx = await getClient().transaction('write');
    try {
        if (!ids.length || new Set(ids).size !== ids.length) fail('Choose projects and refresh the archive.',400);
        if (action === 'empty' && receipt) await authorizeArchivePurge(tx,actor.id,ids,receipt);
        const records = [];
        for (const projectId of ids) {
            const p = (await tx.execute({sql:'SELECT * FROM projects WHERE id=?',args:[projectId]})).rows[0];
            if (!p) fail('The archive changed. Refresh before continuing.',409);
            if (action === 'empty' && p.status !== 'archived') fail('Only archived projects can be permanently deleted. Refresh the archive.',409);
            if (action !== 'restore' && (await tx.execute({sql:'SELECT id FROM time_entries WHERE project_id=? AND end_ms IS NULL LIMIT 1',args:[projectId]})).rows.length) fail('Stop running project timers before archiving or deleting.',409);
            if (action === 'empty' && !receipt && (await tx.execute({sql:'SELECT id FROM payment_invoice_items WHERE project_id=? LIMIT 1',args:[projectId]})).rows.length) fail('Export and save the archive PDF before deleting paid work.',409);
            records.push(p);
        }
        for (const p of records) {
            const projectId = String(p.id);
            if (action === 'empty') {
                if (receipt) {
                    const sheets=(await tx.execute({sql:`SELECT s.* FROM timesheets s WHERE s.status IN ('SUBMITTED','APPROVED') AND (EXISTS(SELECT 1 FROM task_entries t WHERE t.project_id=?1 AND t.user_id=s.user_id AND t.date>=s.week_start AND t.date<date(s.week_start,'+7 days')) OR EXISTS(SELECT 1 FROM time_entries t WHERE t.project_id=?1 AND t.user_id=s.user_id AND t.start_ms<s.end_ms AND t.end_ms>s.start_ms))`,args:[projectId]})).rows;
                    for(const sheet of sheets) {
                        await tx.execute({sql:"UPDATE timesheets SET status='RETURNED',comment='Project work permanently deleted after PDF export. Review remaining hours.' WHERE id=?",args:[sheet.id]});
                        await tx.execute({sql:'INSERT INTO audit_log(id,actor_id,entity,entity_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)',args:[id(),actor.id,'timesheets',sheet.id,'returned_after_archive_deletion',JSON.stringify(sheet),JSON.stringify({status:'RETURNED'}),Date.now()]});
                    }
                    await tx.execute({sql:'DELETE FROM payment_times WHERE time_entry_id IN (SELECT id FROM time_entries WHERE project_id=?)',args:[projectId]});
                    await tx.execute({sql:'DELETE FROM payment_tasks WHERE task_id IN (SELECT id FROM task_entries WHERE project_id=?)',args:[projectId]});
                }
                await tx.execute({sql:`INSERT OR REPLACE INTO deleted_task_sync(task_id,spreadsheet_id,sheet_tab,updated_at)
                    SELECT t.id,COALESCE(NULLIF(p.spreadsheet_id,''),s.value),COALESCE(NULLIF(a.sheet_tab,''),'Task log'),?
                    FROM task_entries t JOIN projects p ON p.id=t.project_id LEFT JOIN accounts a ON a.id=t.account_id
                    LEFT JOIN settings s ON s.key='spreadsheet_id' WHERE p.id=? AND COALESCE(NULLIF(p.spreadsheet_id,''),s.value,'')<>''`,args:[Date.now(),projectId]});
                for (const sql of [
                    "DELETE FROM work_client_rates WHERE kind='time' AND work_id IN (SELECT id FROM time_entries WHERE project_id=?)",
                    "DELETE FROM work_client_rates WHERE kind='task' AND work_id IN (SELECT id FROM task_entries WHERE project_id=?)",
                    'DELETE FROM time_entries WHERE project_id=?',
                    'DELETE FROM task_hour_reviews WHERE task_id IN (SELECT id FROM task_entries WHERE project_id=?)',
                    'DELETE FROM sync_jobs WHERE task_id IN (SELECT id FROM task_entries WHERE project_id=?)',
                    'DELETE FROM task_entries WHERE project_id=?',
                    'DELETE FROM account_assignments WHERE account_id IN (SELECT id FROM accounts WHERE project_id=?)',
                    'DELETE FROM accounts WHERE project_id=?',
                    'DELETE FROM project_assignments WHERE project_id=?',
                    'DELETE FROM project_time_tracking WHERE project_id=?',
                    'DELETE FROM project_client_rates WHERE project_id=?',
                    "DELETE FROM deleted_records WHERE entity='projects' AND entity_id=?",
                    'DELETE FROM projects WHERE id=?',
                ]) await tx.execute({sql,args:[projectId]});
            } else {
                await tx.execute({sql:"DELETE FROM deleted_records WHERE entity='projects' AND entity_id=?",args:[projectId]});
                await tx.execute({sql:'UPDATE projects SET status=? WHERE id=?',args:[action==='archive'?'archived':'active',projectId]});
            }
            await tx.execute({sql:'INSERT INTO audit_log(id,actor_id,entity,entity_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)',args:[id(),actor.id,'projects',projectId,action==='empty'?'permanently_deleted':action==='archive'?'archived':'restored',JSON.stringify(p),action==='empty'?null:JSON.stringify({status:action==='archive'?'archived':'active'}),Date.now()]});
        }
        if (action === 'empty' && receipt) for(const projectId of ids) await tx.execute({sql:'DELETE FROM archive_purge_scope WHERE project_id=?',args:[projectId]});
        await tx.commit();
        return {saved:true,message:action==='empty'?`Saved. Permanently deleted ${records.length} archived project(s) and their work records.`:action==='archive'?'Saved. Project archived.':'Saved. Project restored.'};
    } catch(error) { await tx.rollback(); throw error; }
    finally { tx.close(); }
}
