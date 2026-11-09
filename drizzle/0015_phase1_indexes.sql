CREATE INDEX IF NOT EXISTS task_date_created ON task_entries(date DESC,created_at DESC,id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS task_project_date ON task_entries(project_id,date DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS time_task ON time_entries(task_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoice_items_task ON payment_invoice_items(task_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoice_items_time ON payment_invoice_items(time_entry_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sync_pending ON sync_jobs(status,updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS login_reset ON login_attempts(reset_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sync_retry (kind TEXT NOT NULL,task_id TEXT NOT NULL,version INTEGER NOT NULL,failures INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(kind,task_id));
