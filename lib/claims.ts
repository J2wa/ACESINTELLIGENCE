import {ensureClaimDetailsSchema} from './claim-details-schema.mjs';
import {z} from 'zod';
import type {Transaction, InValue} from '@libsql/client';
import {getClient} from './database';
import {fail, id, stmt} from './auth';
import {day,midnight} from './core.mjs';
import {ensureClaimsSchema} from './claims-schema.mjs';

type Actor={id:string;role:string};
type Pool={id:string;project_id:string;account_id:string;video_id:string;duration_seconds:number;notes:string;status:string;claimed_by:string|null;claimed_at:number|null;deadline_at:number|null;task_entry_id:string|null;version:number;overdue:number;expiry_count:number};
const uid=z.string().min(1).max(100), selected={id:uid,version:z.number().int().positive()};
export const claimProjectFields={claiming_enabled:z.number().int().min(0).max(1).optional(),claim_deadline_hours:z.number().int().min(1).max(720).optional(),claim_max_active:z.number().int().min(1).max(1000).optional()};
export const claimInput=z.object(selected).strict();
export const poolInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('add'),project_id:uid,account_id:uid,items:z.array(z.object({video_id:z.string().min(1).max(250).refine(v=>!!v.trim(),'Task ID is required.'),duration_seconds:z.number().int().min(0).max(359999999).default(0),notes:z.string().max(5000).default(''),english_subtitles:z.boolean().optional()}).strict()).min(1).max(100)}).strict(),
 z.object({action:z.enum(['cancel','delete']),...selected}).strict()
]);
export const adminClaimInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('release'),...selected,reason:z.string().trim().min(1).max(2000)}).strict(),
 z.object({action:z.literal('extend'),...selected,reason:z.string().trim().min(1).max(2000),hours:z.number().int().min(1).max(720)}).strict()
]);
const rows=async(tx:Transaction,sql:string,...args:InValue[])=>(await tx.execute({sql,args})).rows;
const first=async(tx:Transaction,sql:string,...args:InValue[])=>(await rows(tx,sql,...args))[0];
async function record(tx:Transaction,actor:string|null,p:Pool,action:string,after:unknown,now:number){
 await tx.execute(stmt('INSERT INTO audit_log(id,actor_id,entity,entity_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)',id(),actor,'task_pool',p.id,action,JSON.stringify(p),JSON.stringify(after),now));
}
async function activeActor(tx:Transaction,u:Actor,admin=false){
 const user=await first(tx,'SELECT role FROM users WHERE id=? AND active=1',u.id);
 if(!user||user.role!==u.role)fail('Access denied.',403);
 if(admin&&user.role!=='ADMIN')fail('Administrator access required.',403);
}
async function assigned(tx:Transaction,u:Actor,p:Pool){
 if(u.role==='ADMIN')return;
 if(!await first(tx,'SELECT 1 FROM project_assignments WHERE project_id=? AND user_id=?',p.project_id,u.id)||!await first(tx,'SELECT 1 FROM account_assignments WHERE account_id=? AND user_id=?',p.account_id,u.id))fail('You are not assigned to this account or project.',403);
}
async function activeAccount(tx:Transaction,project:string,account:string){
 const p=await first(tx,`SELECT p.*,COALESCE(c.enabled,0) AS claiming_enabled,COALESCE(c.deadline_hours,24) AS deadline_hours,COALESCE(c.max_active,1) AS max_active FROM projects p JOIN accounts a ON a.project_id=p.id LEFT JOIN project_task_claiming c ON c.project_id=p.id WHERE p.id=? AND a.id=? AND p.status='active' AND a.active=1 AND NOT EXISTS(SELECT 1 FROM deleted_records WHERE entity='projects' AND entity_id=p.id) AND NOT EXISTS(SELECT 1 FROM deleted_work_accounts WHERE account_id=a.id)`,project,account);
 if(!p)fail('Choose an active project and work account.',403);
 return p!;
}
// A release never destroys logged work, even when that work is not yet approved.
async function releaseBlock(tx:Transaction,p:Pool,automatic:boolean){
 const t=await first(tx,'SELECT * FROM task_entries WHERE id=?',p.task_entry_id);
 if(!t)return 'Linked task is missing; administrator review required.';
 if(t.status!=='PENDING')return 'Task has a reviewed or skipped status.';
 if(automatic&&Number(t.version)!==1)return 'Task was edited; administrator review required.';
 if(await first(tx,'SELECT 1 FROM time_entries WHERE task_id=?',p.task_entry_id))return 'Task has logged time. Retain the work or remove eligible time in Timesheets first.';
 if(await first(tx,"SELECT 1 FROM task_hour_reviews WHERE task_id=? AND status='APPROVED'",p.task_entry_id))return 'Task has approved hours.';
 if(await first(tx,'SELECT 1 FROM payment_tasks WHERE task_id=? UNION ALL SELECT 1 FROM payment_invoice_items WHERE task_id=?',p.task_entry_id,p.task_entry_id))return 'Task is invoiced or paid.';
 if(await first(tx,"SELECT 1 FROM timesheets WHERE user_id=? AND status IN ('SUBMITTED','APPROVED') AND start_ms<? AND end_ms>?",t.user_id,midnight(String(t.date))+1,midnight(String(t.date))))return 'Task week is submitted or approved.';
 if(await first(tx,'SELECT 1 FROM deleted_task_sync WHERE task_id=?',p.task_entry_id))return 'Previous spreadsheet removal is pending.';
 return null;
}
async function release(tx:Transaction,p:Pool,actor:string|null,action:string,reason:string,now:number){
 const target=await first(tx,"SELECT COALESCE(NULLIF(p.spreadsheet_id,''),(SELECT value FROM settings WHERE key='spreadsheet_id')) AS spreadsheet_id,a.sheet_tab FROM projects p JOIN accounts a ON a.project_id=p.id WHERE p.id=? AND a.id=?",p.project_id,p.account_id);
 if(target?.spreadsheet_id)await tx.execute(stmt('INSERT INTO deleted_task_sync(task_id,spreadsheet_id,sheet_tab,updated_at) VALUES(?,?,?,?)',p.task_entry_id,target.spreadsheet_id,target.sheet_tab||'Task log',now));
 const task=await first(tx,'SELECT * FROM task_entries WHERE id=?',p.task_entry_id);
 await tx.execute(stmt("UPDATE task_pool SET status='AVAILABLE',claimed_by=NULL,claimed_at=NULL,deadline_at=NULL,task_entry_id=NULL,overdue=0,completed_at=NULL,version=version+1,expiry_count=expiry_count+? WHERE id=? AND version=?",action==='expired'?1:0,p.id,p.version));
 await tx.execute(stmt('DELETE FROM task_hour_reviews WHERE task_id=?',p.task_entry_id));
 await tx.execute(stmt('DELETE FROM sync_jobs WHERE task_id=?',p.task_entry_id));
 await tx.execute(stmt('DELETE FROM task_entries WHERE id=?',p.task_entry_id));
 await tx.execute(stmt('INSERT INTO audit_log(id,actor_id,entity,entity_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)',id(),actor,'task_entries',p.task_entry_id,'claim_released',JSON.stringify(task),null,now));
 await tx.execute(stmt("UPDATE task_pool_details SET extension_status='CLOSED' WHERE pool_id=?",p.id));
 await record(tx,actor,p,action,{status:'AVAILABLE',reason},now);
}
/** Called inside the caller's write transaction. Overdue marking happens once. */
export async function expireOverdueClaims(now:number,tx:Transaction){
 const pending=await rows(tx,"SELECT * FROM task_pool WHERE status='CLAIMED' AND overdue=0 AND deadline_at<=? ORDER BY deadline_at,id",now) as unknown as Pool[];
 for(const p of pending){
  const reason=await releaseBlock(tx,p,true);
  if(reason){await tx.execute(stmt('UPDATE task_pool SET overdue=1,version=version+1 WHERE id=? AND version=?',p.id,p.version));await record(tx,null,p,'overdue',{reason},now);}
  else await release(tx,p,null,'expired','Deadline passed with no logged or protected work.',now);
 }
}
export async function claimsTransaction<T>(work:(tx:Transaction,now:number)=>Promise<T>){
 await ensureClaimsSchema(getClient());
 await ensureClaimDetailsSchema(getClient());
 const tx=await getClient().transaction('write');
 try{const now=Date.now();await expireOverdueClaims(now,tx);const result=await work(tx,now);await tx.commit();return result;}
 catch(e){await tx.rollback();throw e;}finally{tx.close();}
}
// Reads must not hold the database writer lock while returning a dashboard.
// Expire due claims in a short write transaction first; normal reads never write.
export async function claimsReadTransaction<T>(work:(tx:Transaction)=>Promise<T>){
 await ensureClaimsSchema(getClient());
 await ensureClaimDetailsSchema(getClient());
 const due=await getClient().execute(stmt("SELECT 1 FROM task_pool WHERE status='CLAIMED' AND overdue=0 AND deadline_at<=? LIMIT 1",Date.now()));
 if(due.rows.length)await claimsTransaction(async()=>{});
 const tx=await getClient().transaction('read');
 try{const result=await work(tx);await tx.commit();return result;}
 catch(e){await tx.rollback();throw e;}finally{tx.close();}
}
export async function claimsSnapshot(tx:Transaction,u:Actor){
 const pool=await rows(tx,`SELECT p.*,d.english_subtitles,CASE WHEN d.requested_by=p.claimed_by THEN d.extension_hours END AS extension_hours,CASE WHEN d.requested_by=p.claimed_by THEN d.extension_reason END AS extension_reason,CASE WHEN d.requested_by=p.claimed_by THEN d.extension_status END AS extension_status,(SELECT notes FROM task_entries t WHERE t.id=p.task_entry_id) AS task_notes,(SELECT status FROM task_entries t WHERE t.id=p.task_entry_id) AS task_status FROM task_pool p LEFT JOIN task_pool_details d ON d.pool_id=p.id WHERE ${u.role==='ADMIN'?'1=1':`p.claimed_by=? OR (p.status='AVAILABLE' AND EXISTS(SELECT 1 FROM project_task_claiming c WHERE c.project_id=p.project_id AND c.enabled=1) AND EXISTS(SELECT 1 FROM projects x WHERE x.id=p.project_id AND x.status='active') AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=p.account_id AND a.active=1) AND NOT EXISTS(SELECT 1 FROM deleted_records WHERE entity='projects' AND entity_id=p.project_id) AND NOT EXISTS(SELECT 1 FROM deleted_work_accounts WHERE account_id=p.account_id) AND EXISTS(SELECT 1 FROM project_assignments WHERE project_id=p.project_id AND user_id=?) AND EXISTS(SELECT 1 FROM account_assignments WHERE account_id=p.account_id AND user_id=?))`} ORDER BY p.created_at,p.id`,...(u.role==='ADMIN'?[]:[u.id,u.id,u.id]));
 return pool.map(p=>{if(u.role==='ADMIN')return p;const safe={...p};delete safe.created_by;delete safe.expiry_count;return safe;});
}
export async function managePool(u:Actor,input:unknown){
 const b=poolInput.parse(input);
 return claimsTransaction(async(tx,now)=>{
  await activeActor(tx,u,true);
  if(b.action==='add'){
   await activeAccount(tx,b.project_id,b.account_id);
   for(const item of b.items){
    const p={...item,id:id(),project_id:b.project_id,account_id:b.account_id};
    await tx.execute(stmt('INSERT INTO task_pool(id,project_id,account_id,video_id,duration_seconds,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',p.id,p.project_id,p.account_id,p.video_id,p.duration_seconds,p.notes,u.id,now));
    if(item.english_subtitles!==undefined)await tx.execute(stmt('INSERT INTO task_pool_details(pool_id,english_subtitles) VALUES(?,?)',p.id,item.english_subtitles?1:0));
    await record(tx,u.id,p as Pool,'pool_added',{status:'AVAILABLE'},now);
   }
   return {saved:true,count:b.items.length};
  }
  const p=await first(tx,'SELECT * FROM task_pool WHERE id=?',b.id) as unknown as Pool;
  if(!p)fail('Pool item not found.',404);
  if(b.action==='delete'){if(p.version!==b.version||!['AVAILABLE','CANCELLED'].includes(p.status)||p.task_entry_id)fail('Release the claim before deleting this pool entry.',409);await record(tx,u.id,p,'permanently_deleted',null,now);await tx.execute(stmt('DELETE FROM task_pool_details WHERE pool_id=?',p.id));await tx.execute(stmt('DELETE FROM task_pool WHERE id=?',p.id));return {saved:true};}
  if(p.status!=='AVAILABLE'||p.version!==b.version)fail('Pool item changed. Refresh and retry.',409);
  await tx.execute(stmt("UPDATE task_pool SET status='CANCELLED',version=version+1 WHERE id=? AND version=?",p.id,p.version));
  await record(tx,u.id,p,'cancelled',{status:'CANCELLED'},now);return {saved:true};
 });
}
export async function claimTask(u:Actor,input:unknown){
 const b=claimInput.parse(input);
 return claimsTransaction(async(tx,now)=>{
  await activeActor(tx,u);
  if(u.role!=='EMPLOYEE')fail('Only employees can claim tasks.',403);
  const p=await first(tx,'SELECT * FROM task_pool WHERE id=?',b.id) as unknown as Pool;
  if(!p)fail('Task is unavailable.',404);
  await assigned(tx,u,p);const project=await activeAccount(tx,p.project_id,p.account_id);
  if(p.status!=='AVAILABLE'||p.version!==b.version)fail('Already claimed',409);
  if(!project.claiming_enabled)fail('Task claiming is disabled for this project.',403);
  const count=await first(tx,"SELECT COUNT(*) AS n FROM task_pool WHERE project_id=? AND claimed_by=? AND status='CLAIMED'",p.project_id,u.id);
  if(Number(count?.n)>=Number(project.max_active))fail('Maximum active claims reached for this project.',409);
  const taskId=id(),deadline=now+Number(project.deadline_hours)*3600000;
  const changed=await tx.execute(stmt("UPDATE task_pool SET status='CLAIMED',claimed_by=?,claimed_at=?,deadline_at=?,task_entry_id=?,overdue=0,version=version+1 WHERE id=? AND status='AVAILABLE' AND version=?",u.id,now,deadline,taskId,p.id,b.version));
  if(changed.rowsAffected!==1)fail('Already claimed',409);
  await tx.execute(stmt("INSERT INTO task_entries(id,date,project_id,account_id,user_id,video_id,duration_seconds,status,notes,created_at,updated_at,pay_basis,rate_cents) VALUES(?,?,?,?,?,?,?,'PENDING',?,?,?,?,?)",taskId,day(now),p.project_id,p.account_id,u.id,p.video_id,project.pay_basis==='VIDEO_HOUR'?p.duration_seconds:0,p.notes,now,now,project.pay_basis,project.rate_cents));
  await tx.execute(stmt("INSERT INTO sync_jobs(task_id,status,updated_at) VALUES(?,'pending',?)",taskId,now));
  await tx.execute(stmt('INSERT INTO audit_log(id,actor_id,entity,entity_id,action,after_json,created_at) VALUES(?,?,?,?,?,?,?)',id(),u.id,'task_entries',taskId,'claimed',JSON.stringify({pool_id:p.id,deadline_at:deadline}),now));
  await record(tx,u.id,p,'claimed',{task_entry_id:taskId,claimed_by:u.id,claimed_at:now,deadline_at:deadline},now);
  return {saved:true,id:taskId,deadline_at:deadline};
 });
}
export async function changeClaim(u:Actor,input:unknown,action:'release'|'complete'|'admin'){
 const b: {id:string;version:number;action?:string;hours?:number;reason?:string}=action==='admin'?adminClaimInput.parse(input):claimInput.parse(input);
 return claimsTransaction(async(tx,now)=>{
  await activeActor(tx,u,action==='admin');
  const p=await first(tx,'SELECT * FROM task_pool WHERE id=?',b.id) as unknown as Pool;
  if(!p||(action!=='admin'&&p.claimed_by!==u.id))fail('Claim not found.',404);
  await assigned(tx,u,p);
  if(p.status!=='CLAIMED'||p.version!==b.version)fail('Claim changed or expired. Refresh and retry.',409);
  if(action==='admin'&&b.hours!==undefined){
   const deadline=Math.max(now,p.deadline_at!)+b.hours*3600000;
   await tx.execute(stmt('UPDATE task_pool SET deadline_at=?,overdue=0,version=version+1 WHERE id=? AND version=?',deadline,p.id,p.version));
   await tx.execute(stmt("UPDATE task_pool_details SET extension_status='APPROVED' WHERE pool_id=? AND requested_by=? AND extension_status='PENDING'",p.id,p.claimed_by));
   await record(tx,u.id,p,'deadline_extended',{deadline_at:deadline,reason:b.reason},now);return {saved:true};
  }
  if(action==='complete'){
   if(p.deadline_at!<=now||p.overdue)fail('Claim is overdue. Ask an administrator to extend the deadline before submitting.',409);
   if(await first(tx,'SELECT 1 FROM time_entries WHERE task_id=? AND end_ms IS NULL',p.task_entry_id))fail('Stop the linked timer before submitting.',409);
   await tx.execute(stmt("UPDATE task_pool SET status='COMPLETED',completed_at=?,version=version+1 WHERE id=? AND version=?",now,p.id,p.version));
   await tx.execute(stmt("UPDATE task_entries SET status='PENDING',version=version+1,updated_at=? WHERE id=? AND status='RETURNED'",now,p.task_entry_id));
   await tx.execute(stmt("INSERT INTO sync_jobs(task_id,status,updated_at) VALUES(?,'pending',?) ON CONFLICT(task_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at",p.task_entry_id,now));
   await record(tx,u.id,p,'completed',{completed_at:now},now);return {saved:true};
  }
  const blocked=await releaseBlock(tx,p,false);if(blocked)fail(blocked,409);
  await release(tx,p,u.id,action==='admin'?'force_released':'released',b.reason??'Voluntary release',now);return {saved:true};
 });
}

const detailsInput=z.discriminatedUnion('action',[
 z.object({...selected,action:z.literal('subtitles'),english_subtitles:z.boolean()}).strict(),
 z.object({...selected,action:z.literal('request'),hours:z.number().int().min(1).max(720),reason:z.string().trim().min(1).max(2000)}).strict(),
 z.object({...selected,action:z.enum(['approve','reject'])}).strict()
]);
export async function updateClaimDetails(u:Actor,input:unknown){
 const b=detailsInput.parse(input);
 return claimsTransaction(async(tx,now)=>{
  await activeActor(tx,u,b.action!=='request');
  const p=await first(tx,'SELECT * FROM task_pool WHERE id=?',b.id) as unknown as Pool;
  if(!p)fail('Task not found.',404);
  if(p.version!==b.version)fail('Task changed. Refresh and retry.',409);
  if(b.action==='subtitles'){
   await tx.execute(stmt('INSERT INTO task_pool_details(pool_id,english_subtitles) VALUES(?,?) ON CONFLICT(pool_id) DO UPDATE SET english_subtitles=excluded.english_subtitles',p.id,b.english_subtitles?1:0));
  }else{
   if(p.status!=='CLAIMED')fail('Only active claims can request an extension.',409);
   const details=await first(tx,'SELECT * FROM task_pool_details WHERE pool_id=?',p.id);
   if(b.action==='request'){
    if(u.role!=='EMPLOYEE'||p.claimed_by!==u.id)fail('Only the employee who claimed this task can request an extension.',403);
    await assigned(tx,u,p);
    if(details?.extension_status==='PENDING'&&details.requested_by===u.id)fail('An extension request is already pending.',409);
    await tx.execute(stmt("INSERT INTO task_pool_details(pool_id,extension_hours,extension_reason,extension_status,requested_by) VALUES(?,?,?,'PENDING',?) ON CONFLICT(pool_id) DO UPDATE SET extension_hours=excluded.extension_hours,extension_reason=excluded.extension_reason,extension_status='PENDING',requested_by=excluded.requested_by",p.id,b.hours,b.reason,u.id));
   }else{
    if(details?.extension_status!=='PENDING'||details.requested_by!==p.claimed_by)fail('No pending request for this claim.',409);
    if(b.action==='approve')await tx.execute(stmt('UPDATE task_pool SET deadline_at=?,overdue=0 WHERE id=?',Math.max(now,p.deadline_at!)+Number(details.extension_hours)*3600000,p.id));
    await tx.execute(stmt('UPDATE task_pool_details SET extension_status=? WHERE pool_id=?',b.action==='approve'?'APPROVED':'REJECTED',p.id));
   }
  }
  await tx.execute(stmt('UPDATE task_pool SET version=version+1 WHERE id=?',p.id));
  await record(tx,u.id,p,'claim_'+b.action,b,now);
  return {saved:true};
 });
}
