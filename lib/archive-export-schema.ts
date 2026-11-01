// Invoice lines retain immutable historical identifiers after project removal.
export const ARCHIVE_EXPORT_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS archive_export_schema (version INTEGER PRIMARY KEY)",
  "CREATE TABLE IF NOT EXISTS archive_export_receipts (token_hash TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), snapshot_hash TEXT NOT NULL, expires_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS archive_purge_scope (project_id TEXT PRIMARY KEY)",
  "CREATE TABLE payment_invoice_items_snapshot (\n id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES payment_invoices(id), user_id TEXT NOT NULL REFERENCES users(id),\n task_id TEXT, time_entry_id TEXT, work_date TEXT NOT NULL,\n project_id TEXT NOT NULL, project_name TEXT NOT NULL, account_id TEXT, account_name TEXT NOT NULL,\n task_label TEXT NOT NULL, task_status TEXT NOT NULL, pay_basis TEXT NOT NULL, units REAL NOT NULL, rate_cents INTEGER NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents>=0)\n);",
  "INSERT INTO payment_invoice_items_snapshot SELECT * FROM payment_invoice_items",
  "DROP TRIGGER IF EXISTS immutable_payment_invoice_items_delete",
  "DROP TABLE payment_invoice_items",
  "ALTER TABLE payment_invoice_items_snapshot RENAME TO payment_invoice_items",
  "CREATE INDEX IF NOT EXISTS invoice_items_invoice ON payment_invoice_items(invoice_id);",
  "CREATE TRIGGER IF NOT EXISTS immutable_payment_invoice_items_update BEFORE UPDATE ON payment_invoice_items BEGIN SELECT RAISE(ABORT,'invoice_immutable'); END;",
  "CREATE TRIGGER IF NOT EXISTS immutable_payment_invoice_items_delete BEFORE DELETE ON payment_invoice_items BEGIN SELECT RAISE(ABORT,'invoice_immutable'); END;",
  "DROP TRIGGER IF EXISTS immutable_payment_tasks_delete",
  "CREATE TRIGGER immutable_payment_tasks_delete BEFORE DELETE ON payment_tasks WHEN NOT EXISTS(SELECT 1 FROM task_entries w JOIN archive_purge_scope g ON g.project_id=w.project_id WHERE w.id=OLD.task_id) BEGIN SELECT RAISE(ABORT,'invoice_immutable'); END",
  "DROP TRIGGER IF EXISTS immutable_payment_times_delete",
  "CREATE TRIGGER immutable_payment_times_delete BEFORE DELETE ON payment_times WHEN NOT EXISTS(SELECT 1 FROM time_entries w JOIN archive_purge_scope g ON g.project_id=w.project_id WHERE w.id=OLD.time_entry_id) BEGIN SELECT RAISE(ABORT,'invoice_immutable'); END",
  "DROP TRIGGER IF EXISTS task_delete_guard",
  "CREATE TRIGGER IF NOT EXISTS task_delete_guard BEFORE DELETE ON task_entries WHEN NOT EXISTS(SELECT 1 FROM archive_purge_scope WHERE project_id=OLD.project_id) BEGIN\n      SELECT CASE WHEN EXISTS(SELECT 1 FROM timesheets s WHERE s.user_id=OLD.user_id AND s.status IN ('SUBMITTED','APPROVED') AND OLD.date>=s.week_start AND OLD.date<date(s.week_start,'+7 days')) THEN RAISE(ABORT,'week_locked') END;\n    END",
  "DROP TRIGGER IF EXISTS time_delete_guard",
  "CREATE TRIGGER IF NOT EXISTS time_delete_guard BEFORE DELETE ON time_entries WHEN NOT EXISTS(SELECT 1 FROM archive_purge_scope WHERE project_id=OLD.project_id) BEGIN\n      SELECT CASE WHEN OLD.end_ms IS NULL THEN RAISE(ABORT,'running_timer') END;\n      SELECT CASE WHEN EXISTS(SELECT 1 FROM timesheets s WHERE s.user_id=OLD.user_id AND s.status IN ('SUBMITTED','APPROVED') AND s.start_ms<OLD.end_ms AND s.end_ms>OLD.start_ms) THEN RAISE(ABORT,'week_locked') END;\n    END",
  "INSERT OR IGNORE INTO archive_export_schema(version) VALUES(1)"
];
