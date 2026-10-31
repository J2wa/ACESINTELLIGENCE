ALTER TABLE projects ADD COLUMN pay_basis TEXT NOT NULL DEFAULT 'WORKING_HOUR' CHECK(pay_basis IN ('TASK','VIDEO_HOUR','WORKING_HOUR'));
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN spreadsheet_id TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE task_entries ADD COLUMN pay_basis TEXT NOT NULL DEFAULT 'WORKING_HOUR' CHECK(pay_basis IN ('TASK','VIDEO_HOUR','WORKING_HOUR'));
--> statement-breakpoint
ALTER TABLE task_entries ADD COLUMN rate_cents INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE time_entries ADD COLUMN pay_basis TEXT NOT NULL DEFAULT 'WORKING_HOUR' CHECK(pay_basis IN ('TASK','VIDEO_HOUR','WORKING_HOUR'));
--> statement-breakpoint
CREATE TABLE task_hour_reviews (
 task_id TEXT PRIMARY KEY REFERENCES task_entries(id),
 signature TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('APPROVED','RETURNED')),
 reviewed_by TEXT NOT NULL REFERENCES users(id),
 reviewed_at INTEGER NOT NULL
);
