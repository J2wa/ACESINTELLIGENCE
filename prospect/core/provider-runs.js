// Durable reservation occurs before a billable provider request. Unknown outcomes are
// deliberately not retried: an operator must reconcile them in the provider dashboard.
export const RUN_MIGRATION=`CREATE TABLE IF NOT EXISTS prospect_provider_runs (request_key TEXT PRIMARY KEY, seat_id TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL, run_id TEXT UNIQUE, detail TEXT)`;
export async function reserveRun(db,key,seat,now=Date.now()){
 if(!/^[a-zA-Z0-9_-]{16,80}$/.test(key))throw Error('A unique request ID is required.');
 const tx=await db.transaction('write');try{
 const existing=await tx.execute({sql:'SELECT * FROM prospect_provider_runs WHERE request_key=?',args:[key]});
 if(existing.rows.length){if(existing.rows[0].seat_id!==seat)throw Error('Request belongs to another seat.');await tx.commit();return {existing:true,run:existing.rows[0]}}
 const count=await tx.execute({sql:'SELECT COUNT(*) AS count FROM prospect_provider_runs WHERE created_at>?',args:[now-3600000]});if(Number(count.rows[0].count)>=5)throw Error('Hourly provider limit reached. Try again later.');
 await tx.execute({sql:"INSERT INTO prospect_provider_runs(request_key,seat_id,created_at,status) VALUES (?,?,?,'reserved')",args:[key,seat,now]});await tx.commit();return {existing:false};
 }catch(e){await tx.rollback();throw e}finally{tx.close()}
}
export async function recordRun(db,key,status,runId=null){await db.execute({sql:'UPDATE prospect_provider_runs SET status=?,run_id=COALESCE(?,run_id) WHERE request_key=?',args:[status,runId,key]})}
export async function ownedRun(db,runId,actor){const r=await db.execute({sql:'SELECT * FROM prospect_provider_runs WHERE run_id=?',args:[runId]});const row=r.rows[0];if(!row||(actor.role!=='founder'&&row.seat_id!==actor.id))throw Error('Run not found in this workspace.');return row}
