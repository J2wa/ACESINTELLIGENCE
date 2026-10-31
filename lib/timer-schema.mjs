// Existing projects remain disabled until an administrator explicitly enables timers.
export const TIMER_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS project_time_tracking (
    project_id TEXT PRIMARY KEY REFERENCES projects(id),
    enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
  );`,
  `CREATE TRIGGER IF NOT EXISTS timer_project_guard BEFORE INSERT ON time_entries
   WHEN NEW.source='timer' AND NEW.end_ms IS NULL
   BEGIN
     SELECT CASE WHEN NOT EXISTS (
       SELECT 1 FROM projects p JOIN project_time_tracking s ON s.project_id=p.id
       WHERE p.id=NEW.project_id AND p.status='active' AND s.enabled=1
     ) THEN RAISE(ABORT,'time_tracking_disabled') END;
   END;`,
];
const initialized = new WeakMap();
export async function ensureTimerSchema(client) {
  if (!initialized.has(client)) {
    initialized.set(client, client.batch(TIMER_SCHEMA, 'write').catch(error => {
      initialized.delete(client);
      throw error;
    }));
  }
  await initialized.get(client);
}
