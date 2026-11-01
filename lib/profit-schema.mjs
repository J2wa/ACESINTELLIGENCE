export const PROFIT_SCHEMA = [
 `CREATE TABLE IF NOT EXISTS project_client_rates (project_id TEXT PRIMARY KEY REFERENCES projects(id), rate_cents INTEGER CHECK(rate_cents IS NULL OR (rate_cents>=0 AND rate_cents<=10000000)))`,
 `CREATE TABLE IF NOT EXISTS work_client_rates (kind TEXT NOT NULL CHECK(kind IN ('task','time')), work_id TEXT NOT NULL, rate_cents INTEGER CHECK(rate_cents IS NULL OR (rate_cents>=0 AND rate_cents<=10000000)), PRIMARY KEY(kind,work_id))`,
 `CREATE TRIGGER IF NOT EXISTS capture_task_client_rate AFTER INSERT ON task_entries BEGIN INSERT INTO work_client_rates(kind,work_id,rate_cents) VALUES('task',NEW.id,(SELECT rate_cents FROM project_client_rates WHERE project_id=NEW.project_id)); END`,
 `CREATE TRIGGER IF NOT EXISTS capture_time_client_rate AFTER INSERT ON time_entries BEGIN INSERT INTO work_client_rates(kind,work_id,rate_cents) VALUES('time',NEW.id,CASE WHEN NEW.task_id IS NOT NULL THEN (SELECT rate_cents FROM work_client_rates WHERE kind='task' AND work_id=NEW.task_id) ELSE (SELECT rate_cents FROM project_client_rates WHERE project_id=NEW.project_id) END); END`,
 `CREATE TRIGGER IF NOT EXISTS move_time_client_rate AFTER UPDATE ON time_entries WHEN NEW.project_id!=OLD.project_id OR NEW.task_id IS NOT OLD.task_id BEGIN INSERT INTO work_client_rates(kind,work_id,rate_cents) VALUES('time',NEW.id,CASE WHEN NEW.task_id IS NOT NULL THEN (SELECT rate_cents FROM work_client_rates WHERE kind='task' AND work_id=NEW.task_id) ELSE (SELECT rate_cents FROM project_client_rates WHERE project_id=NEW.project_id) END) ON CONFLICT(kind,work_id) DO UPDATE SET rate_cents=excluded.rate_cents; END`,
 `CREATE TRIGGER IF NOT EXISTS remove_task_client_rate AFTER DELETE ON task_entries BEGIN DELETE FROM work_client_rates WHERE kind='task' AND work_id=OLD.id; END`,
 `CREATE TRIGGER IF NOT EXISTS remove_time_client_rate AFTER DELETE ON time_entries BEGIN DELETE FROM work_client_rates WHERE kind='time' AND work_id=OLD.id; END`,
];
let ready;
export async function ensureProfitSchema(client) {
 if (!ready) ready=client.batch(PROFIT_SCHEMA,'write').catch(error=>{ready=undefined;throw error;});
 await ready;
}
