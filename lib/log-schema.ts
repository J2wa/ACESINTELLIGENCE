import { DB, stmt } from './auth';
// Additive and safe to run on existing deployments without touching saved work.
export const LOG_SCHEMA = [
    `CREATE TABLE IF NOT EXISTS deleted_task_sync (task_id TEXT PRIMARY KEY, spreadsheet_id TEXT NOT NULL, sheet_tab TEXT NOT NULL, updated_at INTEGER NOT NULL, last_error TEXT)`,
    `CREATE TRIGGER IF NOT EXISTS task_delete_guard BEFORE DELETE ON task_entries BEGIN
      SELECT CASE WHEN EXISTS(SELECT 1 FROM timesheets s WHERE s.user_id=OLD.user_id AND s.status IN ('SUBMITTED','APPROVED') AND OLD.date>=s.week_start AND OLD.date<date(s.week_start,'+7 days')) THEN RAISE(ABORT,'week_locked') END;
    END`,
    `CREATE TRIGGER IF NOT EXISTS time_delete_guard BEFORE DELETE ON time_entries BEGIN
      SELECT CASE WHEN OLD.end_ms IS NULL THEN RAISE(ABORT,'running_timer') END;
      SELECT CASE WHEN EXISTS(SELECT 1 FROM timesheets s WHERE s.user_id=OLD.user_id AND s.status IN ('SUBMITTED','APPROVED') AND s.start_ms<OLD.end_ms AND s.end_ms>OLD.start_ms) THEN RAISE(ABORT,'week_locked') END;
    END`,
];
let ready: Promise<unknown> | undefined;
export async function ensureLogSchema() {
    if (!ready) ready = DB().batch(LOG_SCHEMA.map(sql => stmt(sql))).catch(error => { ready = undefined; throw error; });
    await ready;
}
