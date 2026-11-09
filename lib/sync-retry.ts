import {stmt} from './auth';
export async function ensureSyncRetry() {
  await stmt(`CREATE TABLE IF NOT EXISTS sync_retry (
    kind TEXT NOT NULL, task_id TEXT NOT NULL, version INTEGER NOT NULL,
    failures INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(kind,task_id))`).run();
}
export async function deferSync(kind: 'task'|'delete', taskId: string, version: number) {
  await stmt(`INSERT INTO sync_retry(kind,task_id,version,failures,next_attempt_at) VALUES(?,?,?,1,?)
    ON CONFLICT(kind,task_id) DO UPDATE SET version=excluded.version,
    failures=CASE WHEN sync_retry.version=excluded.version THEN MIN(sync_retry.failures+1,10) ELSE 1 END,
    next_attempt_at=? + MIN(3600000,30000 * (1 << CASE WHEN sync_retry.version=excluded.version THEN MIN(sync_retry.failures,7) ELSE 0 END))`,
    kind,taskId,version,Date.now()+30000,Date.now()).run();
}
