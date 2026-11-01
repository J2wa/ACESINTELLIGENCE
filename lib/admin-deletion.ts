import { getClient } from './database';
import { fail, id } from './auth';

export const DELETION_SCHEMA = [
    `CREATE TABLE IF NOT EXISTS deleted_records (entity TEXT NOT NULL CHECK(entity IN ('projects','users','invoices')), entity_id TEXT NOT NULL, deleted_at INTEGER NOT NULL, deleted_by TEXT NOT NULL REFERENCES users(id), previous_state TEXT NOT NULL, PRIMARY KEY(entity,entity_id))`,
    `CREATE TRIGGER IF NOT EXISTS deleted_user_access_guard BEFORE UPDATE ON users WHEN NEW.active=1 AND EXISTS(SELECT 1 FROM deleted_records WHERE entity='users' AND entity_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Restore the deleted employee before enabling access.'); END`,
    `CREATE TRIGGER IF NOT EXISTS deleted_project_access_guard BEFORE UPDATE ON projects WHEN NEW.status='active' AND EXISTS(SELECT 1 FROM deleted_records WHERE entity='projects' AND entity_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Restore the deleted project before activating it.'); END`,
];
let ready: Promise<unknown> | undefined;
export async function ensureDeletionSchema() {
    if (!ready) ready = getClient().batch(DELETION_SCHEMA, 'write').catch(error => { ready = undefined; throw error; });
    await ready;
}

// Keep work and payment references intact. Deletion changes visibility/access only.
export async function changeDeletion(actor: {id:string; role:string}, entity:'projects'|'users'|'invoices', entityId:string, action:'delete'|'restore') {
    if (actor.role !== 'ADMIN') fail('Admin access required.',403);
    await ensureDeletionSchema();
    const tx = await getClient().transaction('write');
    try {
        const table = entity === 'invoices' ? 'payment_invoices' : entity;
        const columns = entity === 'users' ? 'id,name,role,active' : entity === 'projects' ? 'id,name,status' : 'id,number,total_cents';
        const record = (await tx.execute({sql:`SELECT ${columns} FROM ${table} WHERE id=?`,args:[entityId]})).rows[0];
        if (!record) fail('Record not found.',404);
        if (entity === 'users' && (entityId === actor.id || record.role !== 'EMPLOYEE')) fail('Only employee accounts can be deleted. Administrator access is protected.',409);
        const deleted = (await tx.execute({sql:'SELECT * FROM deleted_records WHERE entity=? AND entity_id=?',args:[entity,entityId]})).rows[0];
        if ((action === 'delete' && deleted) || (action === 'restore' && !deleted)) {
            await tx.commit(); return {saved:true,message:action === 'delete' ? 'Already deleted.' : 'Already restored.'};
        }
        if (action === 'delete') {
            if (entity !== 'invoices') {
                const field = entity === 'users' ? 'user_id' : 'project_id';
                if ((await tx.execute({sql:`SELECT id FROM time_entries WHERE ${field}=? AND end_ms IS NULL LIMIT 1`,args:[entityId]})).rows.length) fail('Stop running timers before deleting this record.',409);
            }
            await tx.execute({sql:'INSERT INTO deleted_records(entity,entity_id,deleted_at,deleted_by,previous_state) VALUES(?,?,?,?,?)',args:[entity,entityId,Date.now(),actor.id,JSON.stringify(record)]});
            if (entity === 'users') {
                await tx.execute({sql:'UPDATE users SET active=0 WHERE id=?',args:[entityId]});
                await tx.execute({sql:'DELETE FROM sessions WHERE user_id=?',args:[entityId]});
            }
            if (entity === 'projects') await tx.execute({sql:"UPDATE projects SET status='archived' WHERE id=?",args:[entityId]});
        } else {
            const previous = JSON.parse(String(deleted!.previous_state));
            await tx.execute({sql:'DELETE FROM deleted_records WHERE entity=? AND entity_id=?',args:[entity,entityId]});
            if (entity === 'users') await tx.execute({sql:'UPDATE users SET active=? WHERE id=?',args:[previous.active,entityId]});
            if (entity === 'projects') await tx.execute({sql:'UPDATE projects SET status=? WHERE id=?',args:[previous.status,entityId]});
        }
        await tx.execute({sql:'INSERT INTO audit_log(id,actor_id,entity,entity_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)',args:[id(),actor.id,entity,entityId,action === 'delete' ? 'deleted' : 'restored',JSON.stringify(record),JSON.stringify({deleted:action==='delete',payment_preserved:entity==='invoices'}),Date.now()]});
        await tx.commit();
        return {saved:true,message:action === 'delete' ? 'Deleted. History is preserved; you can restore it from Show deleted.' : 'Restored.'};
    } catch(error) { await tx.rollback(); throw error; }
    finally { tx.close(); }
}
