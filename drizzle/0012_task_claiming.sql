CREATE TABLE IF NOT EXISTS archive_purge_scope (project_id TEXT PRIMARY KEY);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS project_task_claiming (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 deadline_hours INTEGER NOT NULL DEFAULT 24 CHECK(deadline_hours BETWEEN 1 AND 720),
 max_active INTEGER NOT NULL DEFAULT 1 CHECK(max_active BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_pool (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, video_id TEXT NOT NULL,
 duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds>=0), notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','CLAIMED','COMPLETED','CANCELLED')),
 claimed_by TEXT REFERENCES users(id), claimed_at INTEGER, deadline_at INTEGER,
 task_entry_id TEXT UNIQUE, version INTEGER NOT NULL DEFAULT 1,
 overdue INTEGER NOT NULL DEFAULT 0 CHECK(overdue IN (0,1)), completed_at INTEGER,
 expiry_count INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
 UNIQUE(project_id,account_id,video_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS claim_deadlines ON task_pool(status,overdue,deadline_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS claim_employee ON task_pool(project_id,claimed_by,status);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS pool_task_conflict BEFORE INSERT ON task_pool BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM task_entries WHERE project_id=NEW.project_id AND account_id=NEW.account_id AND video_id=NEW.video_id) THEN RAISE(ABORT,'pool_task_conflict') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND project_id=NEW.project_id) THEN RAISE(ABORT,'pool_account_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS pool_reservation_insert BEFORE INSERT ON task_entries
 WHEN EXISTS(SELECT 1 FROM task_pool p WHERE p.project_id=NEW.project_id AND p.account_id=NEW.account_id AND p.video_id=NEW.video_id AND NOT(p.task_entry_id IS NEW.id AND p.status='CLAIMED' AND p.claimed_by IS NEW.user_id))
 BEGIN SELECT RAISE(ABORT,'pool_reserved'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS pool_reservation_update BEFORE UPDATE ON task_entries BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM task_pool p WHERE p.task_entry_id=OLD.id) AND (NEW.project_id!=OLD.project_id OR NEW.account_id!=OLD.account_id OR NEW.video_id!=OLD.video_id OR NEW.user_id!=OLD.user_id) THEN RAISE(ABORT,'claim_identity_locked') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM task_pool p WHERE p.project_id=NEW.project_id AND p.account_id=NEW.account_id AND p.video_id=NEW.video_id AND p.task_entry_id IS NOT NEW.id) THEN RAISE(ABORT,'pool_reserved') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS claim_delete_guard BEFORE DELETE ON task_entries
 WHEN EXISTS(SELECT 1 FROM task_pool WHERE task_entry_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM archive_purge_scope WHERE project_id=OLD.project_id)
 BEGIN SELECT RAISE(ABORT,'claim_release_required'); END;
