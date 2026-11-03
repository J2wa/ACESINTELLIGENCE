import {getClient} from './database';
import {all, cookie, sha} from './auth';
const statements = [
 `CREATE TABLE IF NOT EXISTS user_presence (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, last_active_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS session_presence (token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE, last_active_at INTEGER NOT NULL)`,
];
let ready:Promise<unknown>|undefined;
export async function ensurePresence(){await(ready??=getClient().batch(statements,'write').catch(e=>{ready=undefined;throw e;}));}
export async function recordPresence(req:Request,userId:string){
 await ensurePresence();
 const hash=await sha(cookie(req,'aces_session')), now=Date.now();
 // A revoked session cannot reappear if logout races a heartbeat.
 await getClient().batch([
  {sql:`INSERT INTO session_presence(token_hash,last_active_at) SELECT token_hash,? FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>? AND last_seen>? ON CONFLICT(token_hash) DO UPDATE SET last_active_at=MAX(session_presence.last_active_at,excluded.last_active_at)`,args:[now,hash,userId,now,now-1800000]},
  {sql:`INSERT INTO user_presence(user_id,last_active_at) SELECT user_id,? FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>? AND last_seen>? ON CONFLICT(user_id) DO UPDATE SET last_active_at=MAX(user_presence.last_active_at,excluded.last_active_at)`,args:[now,hash,userId,now,now-1800000]},
 ],'write');
}
export async function presenceList(){
 await ensurePresence();const now=Date.now();
 const users=await all(`SELECT u.id,u.name,u.email,u.role,u.active,p.last_active_at,
 CASE WHEN u.active=1 AND EXISTS(SELECT 1 FROM sessions s JOIN session_presence sp ON sp.token_hash=s.token_hash WHERE s.user_id=u.id AND s.expires_at>? AND s.last_seen>? AND sp.last_active_at>?) THEN 1 ELSE 0 END AS online
 FROM users u LEFT JOIN user_presence p ON p.user_id=u.id
 WHERE NOT EXISTS(SELECT 1 FROM deleted_records d WHERE d.entity='users' AND d.entity_id=u.id)
 ORDER BY online DESC,u.name COLLATE NOCASE`,now,now-1800000,now-120000);
 return {users,checked_at:now};
}
