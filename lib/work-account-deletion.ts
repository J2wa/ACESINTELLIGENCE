import { getClient } from './database';
import { fail, id } from './auth';
export const WORK_ACCOUNT_DELETION_SCHEMA = [
 `CREATE TABLE IF NOT EXISTS deleted_work_accounts (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, deleted_at INTEGER NOT NULL, deleted_by TEXT NOT NULL REFERENCES users(id), previous_active INTEGER NOT NULL CHECK(previous_active IN (0,1)))`,
 `CREATE TRIGGER IF NOT EXISTS deleted_work_account_access_guard BEFORE UPDATE ON accounts WHEN NEW.active=1 AND EXISTS(SELECT 1 FROM deleted_work_accounts WHERE account_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Restore the deleted work account before enabling it.'); END`,
];
let ready:Promise<unknown>|undefined;
export async function ensureWorkAccountDeletion(){await(ready??=getClient().batch(WORK_ACCOUNT_DELETION_SCHEMA,'write').catch(e=>{ready=undefined;throw e;}));}
export async function changeWorkAccountDeletion(actor:{id:string;role:string},accountId:string,action:'delete'|'restore'){
 if(actor.role!=='ADMIN')fail('Admin access required.',403);
 await ensureWorkAccountDeletion();
 const tx=await getClient().transaction('write');
 try{
  const account=(await tx.execute({sql:'SELECT * FROM accounts WHERE id=?',args:[accountId]})).rows[0];
  if(!account)fail('Work account not found.',404);
  const deleted=(await tx.execute({sql:'SELECT * FROM deleted_work_accounts WHERE account_id=?',args:[accountId]})).rows[0];
  if((action==='delete'&&!deleted)||(action==='restore'&&deleted)){
   if(action==='delete'){
    if((await tx.execute({sql:'SELECT t.id FROM time_entries t JOIN task_entries w ON w.id=t.task_id WHERE w.account_id=? AND t.end_ms IS NULL LIMIT 1',args:[accountId]})).rows.length)fail('Stop timers linked to this work account before deleting it.',409);
    await tx.execute({sql:'INSERT INTO deleted_work_accounts(account_id,deleted_at,deleted_by,previous_active) VALUES(?,?,?,?)',args:[accountId,Date.now(),actor.id,account.active]});
    await tx.execute({sql:'UPDATE accounts SET active=0 WHERE id=?',args:[accountId]});
   }else{
    await tx.execute({sql:'DELETE FROM deleted_work_accounts WHERE account_id=?',args:[accountId]});
    await tx.execute({sql:'UPDATE accounts SET active=? WHERE id=?',args:[deleted.previous_active,accountId]});
   }
   await tx.execute({sql:'INSERT INTO audit_log(id,actor_id,entity,entity_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)',args:[id(),actor.id,'accounts',accountId,action==='delete'?'deleted':'restored',JSON.stringify(account),JSON.stringify({deleted:action==='delete',active:action==='delete'?0:deleted.previous_active}),Date.now()]});
  }
  await tx.commit();
  return {saved:true,message:action==='delete'?'Saved. Work account deleted. Task and payment history is preserved.':'Saved. Work account restored.'};
 }catch(e){await tx.rollback();throw e;}finally{tx.close();}
}
