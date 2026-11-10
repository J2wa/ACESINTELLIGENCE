import {all,stmt,config} from './auth';
import {claimsReadTransaction,claimsSnapshot} from './claims';
import {companyProfitRows} from './profit-core.mjs';
import {workspaceRange,taskQuery} from './workspace-query';
import {enrichTaskHours} from './workspace-aggregation';
type SnapshotRows = Awaited<ReturnType<typeof all>>;
export async function snapshot(u: {id:string;role:string}, q?: URLSearchParams) {
 return claimsReadTransaction(async (tx) => {
    const all = async (sql:string,...args:unknown[]) => (await tx.execute(stmt(sql,...args))).rows as SnapshotRows;
    const one = async (sql:string,...args:unknown[]) => (await all(sql,...args))[0];
    const range = workspaceRange(q), lightTasks = q?.get('view') === 'tasks';
    const task_pool = await claimsSnapshot(tx,u);

    const where = u.role === 'ADMIN' ? '' : ' WHERE t.user_id=?', args = u.role === 'ADMIN' ? [] : [u.id];
    const timeRange = lightTasks ? 't.end_ms IS NULL' : range ? '(t.end_ms IS NULL OR (t.start_ms<? AND t.end_ms>?) OR (t.start_ms<? AND t.end_ms>?))' : '1=1';
    const timeArgs = !lightTasks && range ? [range.end,range.start,range.weekEnd,range.weekStart] : [];
    const taskRange = lightTasks ? 't.id IN (SELECT task_id FROM time_entries WHERE end_ms IS NULL)' : range ? '(t.date BETWEEN ? AND ? OR t.id IN (SELECT task_id FROM time_entries t WHERE '+timeRange+'))' : '1=1';
    const taskArgs = !lightTasks && range ? [range.from,range.to,...timeArgs] : [];
    const taskWhere = where + (where ? ' AND ' : ' WHERE ') + taskRange;
    const selectedTasks = 'SELECT t.id FROM task_entries t' + taskWhere;
    const timesWhere = where + (where ? ' AND ' : ' WHERE ') + '('+timeRange+' OR t.task_id IN ('+selectedTasks+'))';
    const result = {
        task_pool, claim_counts: u.role === 'ADMIN' ? {overdue:task_pool.filter(p=>p.overdue===1).length,expired:task_pool.reduce((n,p)=>n+Number(p.expiry_count??0),0)} : undefined,
        user: u, users: await all('SELECT id,name,email,role,active,(SELECT deleted_at FROM deleted_records WHERE entity=\'users\' AND entity_id=users.id) AS deleted_at FROM users' + (u.role === 'ADMIN' ? '' : ' WHERE id=?'), ...args),
        projects: await all('SELECT p.*,(SELECT deleted_at FROM deleted_records WHERE entity=\'projects\' AND entity_id=p.id) AS deleted_at,COALESCE(ea.enabled,0) AS employee_approval_enabled,COALESCE(s.enabled,0) AS time_tracking_enabled,COALESCE(l.work_enabled,0) AS work_enabled,COALESCE(l.work_url,\'\') AS work_url,COALESCE(l.assistant_enabled,0) AS assistant_enabled,COALESCE(l.assistant_url,\'\') AS assistant_url FROM projects p LEFT JOIN project_employee_approval ea ON ea.project_id=p.id LEFT JOIN project_time_tracking s ON s.project_id=p.id LEFT JOIN project_links l ON l.project_id=p.id' + (u.role === 'ADMIN' ? '' : ' WHERE p.id IN (SELECT project_id FROM project_assignments WHERE user_id=?)'), ...args),
        accounts: await all('SELECT accounts.*,(SELECT deleted_at FROM deleted_work_accounts WHERE account_id=accounts.id) AS deleted_at FROM accounts' + (u.role === 'ADMIN' ? '' : ' WHERE id IN (SELECT account_id FROM account_assignments WHERE user_id=?)'), ...args),
        assignments: await all('SELECT * FROM project_assignments' + (u.role === 'ADMIN' ? '' : ' WHERE user_id=?'), ...args), account_assignments: await all('SELECT * FROM account_assignments' + (u.role === 'ADMIN' ? '' : ' WHERE user_id=?'), ...args),
        tasks: await all('SELECT t.*,EXISTS(SELECT 1 FROM payment_invoice_items i WHERE i.task_id=t.id OR i.time_entry_id IN (SELECT id FROM time_entries WHERE task_id=t.id)) AS invoice_locked,EXISTS(SELECT 1 FROM task_hour_reviews r WHERE r.task_id=t.id AND r.status=\'APPROVED\') AS review_approved,EXISTS(SELECT 1 FROM deleted_task_sync d WHERE d.task_id=t.id) AS removal_pending,(SELECT invoice_id FROM payment_tasks WHERE task_id=t.id) AS paid_invoice_id,(SELECT COALESCE(SUM((end_ms-start_ms)/1000),0) FROM time_entries WHERE task_id=t.id AND end_ms IS NOT NULL) AS spent_seconds FROM task_entries t' + taskWhere + ' ORDER BY date DESC,created_at DESC,t.id DESC', ...args,...taskArgs),
        times: await all('SELECT t.*,(SELECT invoice_id FROM payment_times WHERE time_entry_id=t.id) AS paid_invoice_id FROM time_entries t' + timesWhere + ' ORDER BY start_ms DESC', ...args,...timeArgs,...args,...taskArgs), sheets: await all('SELECT t.* FROM timesheets t' + where + ' ORDER BY week_start DESC', ...args),
        invoices: lightTasks ? [] : await all('SELECT t.*,(SELECT deleted_at FROM deleted_records WHERE entity=\'invoices\' AND entity_id=t.id) AS deleted_at FROM payment_invoices t' + where + ' ORDER BY paid_at DESC,number DESC', ...args), invoice_items: lightTasks ? [] : await all('SELECT t.* FROM payment_invoice_items t' + where, ...args),
        sync: u.role === 'ADMIN' ? await all("SELECT task_id,status,last_error,updated_at FROM sync_jobs UNION ALL SELECT task_id,CASE WHEN last_error IS NULL THEN 'pending' ELSE 'error' END,last_error,updated_at FROM deleted_task_sync") : [], settings: u.role === 'ADMIN' ? { spreadsheet_id: (await one("SELECT value FROM settings WHERE key='spreadsheet_id'"))?.value ?? '', google_configured: false, sync_last_run: (await one("SELECT value FROM settings WHERE key='sync_last_run'"))?.value ?? null, sheets_configured: !!config('GOOGLE_SERVICE_ACCOUNT_JSON'), google_only: false } : {}
    };
    const claimSettings = await all('SELECT * FROM project_task_claiming');
    const claimSettingsMap = new Map(claimSettings.map(c=>[c.project_id,c]));
    result.projects = result.projects.map(p=>{const c=claimSettingsMap.get(p.id);return {...p,claiming_enabled:c?.enabled??0,claim_deadline_hours:c?.deadline_hours??24,claim_max_active:c?.max_active??1};});
    const claimMap = new Map(task_pool.map(c=>[c.task_entry_id,c]));
    result.tasks = result.tasks.map(t=>{const c=claimMap.get(t.id);return {...t,claim_id:c?.id??null,claim_status:c?.status??null,claim_deadline_at:c?.deadline_at??null,claim_overdue:c?.overdue??0};});
    const reviews = await all('SELECT r.* FROM task_hour_reviews r WHERE r.task_id IN ('+selectedTasks+')',...args,...taskArgs);
    result.tasks = enrichTaskHours(result.tasks,result.times,reviews,result.sheets);
    if (u.role === 'ADMIN') {
        const clientRates = await all('SELECT * FROM project_client_rates');
        result.projects = result.projects.map((p)=>({...p,client_rate_cents:clientRates.find(r=>r.project_id===p.id)?.rate_cents ?? null}));
        return { ...result, profit_rows:lightTasks ? [] : companyProfitRows(result,await all('SELECT * FROM work_client_rates')) };
    }
    return result;
 });
}

const TASK_SELECT = 'SELECT t.*,EXISTS(SELECT 1 FROM payment_invoice_items i WHERE i.task_id=t.id OR i.time_entry_id IN (SELECT id FROM time_entries WHERE task_id=t.id)) AS invoice_locked,EXISTS(SELECT 1 FROM task_hour_reviews r WHERE r.task_id=t.id AND r.status=\'APPROVED\') AS review_approved,EXISTS(SELECT 1 FROM deleted_task_sync d WHERE d.task_id=t.id) AS removal_pending,(SELECT invoice_id FROM payment_tasks WHERE task_id=t.id) AS paid_invoice_id,(SELECT COALESCE(SUM((end_ms-start_ms)/1000),0) FROM time_entries WHERE task_id=t.id AND end_ms IS NOT NULL) AS spent_seconds FROM task_entries t';

export async function taskPage(u: {id:string;role:string}, params: URLSearchParams) {
 const query = taskQuery(params,u);
 return claimsReadTransaction(async tx => {
  const joins = ' JOIN users u ON u.id=t.user_id JOIN accounts a ON a.id=t.account_id';
  // Two batches preserve one read snapshot without a network round trip per query.
  const summaryGroups = u.role === 'ADMIN' ? [['employee','user_id'],['project','project_id'],['account','account_id']] : [];
  const results = await tx.batch([
    stmt('SELECT COUNT(*) AS n FROM task_entries t'+joins+query.where,...query.args),
    stmt(TASK_SELECT+joins+query.where+' ORDER BY '+query.order+' LIMIT ? OFFSET ?',...query.args,query.limit,query.page*query.limit),
    ...summaryGroups.map(([,column]) => stmt(`SELECT t.${column} AS id,COUNT(*) AS tasks,
      SUM(t.status='PENDING') AS pending,SUM(t.status='APPROVED') AS approved,
      SUM(t.status='RETURNED') AS returned,SUM(t.status='SKIPPED (NO CHANGES)') AS skipped,
      SUM(t.duration_seconds) AS video_seconds,
      SUM((SELECT COALESCE(SUM((end_ms-start_ms)/1000),0) FROM time_entries WHERE task_id=t.id AND end_ms IS NOT NULL)) AS spent_seconds
      FROM task_entries t`+joins+query.where+` GROUP BY t.${column}`,...query.args))
  ]);
  const total = Number(results[0].rows[0].n), tasks = results[1].rows as SnapshotRows;
  const summaries: Record<string,SnapshotRows> = Object.fromEntries(summaryGroups.map(([group],i) => [group,results[i+2].rows as SnapshotRows]));
  if(!tasks.length) return {tasks:[],times:[],summaries,total,page:query.page,limit:query.limit};
  const marks = tasks.map(()=>'?').join(','), ids = tasks.map(t=>t.id);
  const [times,reviews,sheets,claims] = (await tx.batch([
    stmt('SELECT t.*,(SELECT invoice_id FROM payment_times WHERE time_entry_id=t.id) AS paid_invoice_id FROM time_entries t WHERE task_id IN ('+marks+')',...ids),
    stmt('SELECT * FROM task_hour_reviews WHERE task_id IN ('+marks+')',...ids),
    stmt('SELECT * FROM timesheets WHERE user_id IN (SELECT user_id FROM task_entries WHERE id IN ('+marks+'))',...ids),
    stmt('SELECT * FROM task_pool WHERE task_entry_id IN ('+marks+')',...ids)
  ])).map(result => result.rows as SnapshotRows);
  const claimMap = new Map(claims.map(c=>[c.task_entry_id,c]));
  const enriched = enrichTaskHours(tasks,times,reviews,sheets).map(t=>{const c=claimMap.get(t.id);return {...t,claim_id:c?.id??null,claim_status:c?.status??null,claim_deadline_at:c?.deadline_at??null,claim_overdue:c?.overdue??0};});
  return {tasks:enriched,times,summaries,total,page:query.page,limit:query.limit};
 });
}
