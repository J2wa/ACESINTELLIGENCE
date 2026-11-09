import {z} from 'zod';
import {claimsTransaction} from './claims';
import {fail,stmt,audit} from './auth';
import {hoursSignature,midnight} from './core.mjs';
export async function returnTask(u:{id:string;role:string},input:unknown){
 if(u.role!=='ADMIN')fail('Administrator access required.',403);
 const b=z.object({id:z.string().min(1),version:z.number().int(),reason:z.string().trim().min(1).max(2000)}).strict().parse(input);
 return claimsTransaction(async(tx,now)=>{
  const one=async(sql:string,...args:any[])=>(await tx.execute(stmt(sql,...args))).rows[0];
  const task=await one('SELECT * FROM task_entries WHERE id=?',b.id);
  if(!task)fail('Task not found.',404);
  if(task!.version!==b.version)fail('Task changed. Refresh and retry.',409);
  if(await one('SELECT 1 FROM payment_tasks WHERE task_id=? UNION ALL SELECT 1 FROM payment_invoice_items WHERE task_id=? OR time_entry_id IN (SELECT id FROM time_entries WHERE task_id=?) UNION ALL SELECT 1 FROM payment_times WHERE time_entry_id IN (SELECT id FROM time_entries WHERE task_id=?)',b.id,b.id,b.id,b.id))fail('Paid or invoiced tasks cannot be returned.',409);
  const times=(await tx.execute(stmt('SELECT * FROM time_entries WHERE task_id=? ORDER BY id',b.id))).rows;
  if(times.some(t=>t.end_ms===null))fail('Stop linked timers before returning the task.',409);
  const ranges=[{start_ms:midnight(String(task!.date)),end_ms:midnight(String(task!.date))+1},...times];
  for(const range of ranges)if(await one("SELECT 1 FROM timesheets WHERE user_id=? AND status IN ('SUBMITTED','APPROVED') AND start_ms<? AND end_ms>?",task!.user_id,range.end_ms,range.start_ms))fail('Return the locked timesheet before returning this task.',409);
  await tx.execute(stmt("UPDATE task_entries SET status='RETURNED',notes=?,version=version+1,updated_at=? WHERE id=?",String(task!.notes||'')+'\nReturn reason: '+b.reason,now,b.id));
  await tx.execute(stmt("INSERT INTO task_hour_reviews(task_id,signature,status,reviewed_by,reviewed_at) VALUES(?,?,'RETURNED',?,?) ON CONFLICT(task_id) DO UPDATE SET signature=excluded.signature,status='RETURNED',reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at",b.id,hoursSignature(task,times),u.id,now));
  const pool=await one('SELECT * FROM task_pool WHERE task_entry_id=?',b.id);
  if(pool){
   const settings=await one('SELECT deadline_hours FROM project_task_claiming WHERE project_id=?',pool.project_id);
   await tx.execute(stmt("UPDATE task_pool SET status='CLAIMED',completed_at=NULL,overdue=0,deadline_at=?,version=version+1 WHERE id=?",now+Number(settings?.deadline_hours??24)*3600000,pool.id));
   await tx.execute(stmt("UPDATE task_pool_details SET extension_status='CLOSED' WHERE pool_id=?",pool.id));
  }
  await tx.execute(stmt("INSERT INTO sync_jobs(task_id,status,updated_at) VALUES(?,'pending',?) ON CONFLICT(task_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at",b.id,now));
  await tx.execute(audit(u,'task_entries',b.id,'returned_with_hours',task,{reason:b.reason,status:'RETURNED'}));
  return {saved:true};
 });
}
