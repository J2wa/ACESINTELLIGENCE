CREATE TABLE IF NOT EXISTS deleted_work_accounts (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, deleted_at INTEGER NOT NULL, deleted_by TEXT NOT NULL REFERENCES users(id), previous_active INTEGER NOT NULL CHECK(previous_active IN (0,1)));
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS deleted_work_account_access_guard BEFORE UPDATE ON accounts WHEN NEW.active=1 AND EXISTS(SELECT 1 FROM deleted_work_accounts WHERE account_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Restore the deleted work account before enabling it.'); END;
