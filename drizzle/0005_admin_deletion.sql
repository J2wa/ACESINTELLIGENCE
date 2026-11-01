CREATE TABLE IF NOT EXISTS deleted_records (entity TEXT NOT NULL CHECK(entity IN ('projects','users','invoices')), entity_id TEXT NOT NULL, deleted_at INTEGER NOT NULL, deleted_by TEXT NOT NULL REFERENCES users(id), previous_state TEXT NOT NULL, PRIMARY KEY(entity,entity_id));
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS deleted_user_access_guard BEFORE UPDATE ON users WHEN NEW.active=1 AND EXISTS(SELECT 1 FROM deleted_records WHERE entity='users' AND entity_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Restore the deleted employee before enabling access.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS deleted_project_access_guard BEFORE UPDATE ON projects WHEN NEW.status='active' AND EXISTS(SELECT 1 FROM deleted_records WHERE entity='projects' AND entity_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Restore the deleted project before activating it.'); END;
