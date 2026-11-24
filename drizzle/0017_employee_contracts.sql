CREATE TABLE IF NOT EXISTS contract_templates(id TEXT PRIMARY KEY,title TEXT NOT NULL,pdf_base64 TEXT NOT NULL,sha256 TEXT NOT NULL UNIQUE,created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS contract_assignments(id TEXT PRIMARY KEY,template_id TEXT NOT NULL REFERENCES contract_templates(id),user_id TEXT NOT NULL REFERENCES users(id),assigned_at INTEGER NOT NULL,UNIQUE(template_id,user_id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS contract_signatures(assignment_id TEXT PRIMARY KEY REFERENCES contract_assignments(id),signer_name TEXT NOT NULL,signer_email TEXT NOT NULL,address TEXT NOT NULL,method TEXT NOT NULL CHECK(method IN ('typed','drawn','uploaded')),consent TEXT NOT NULL,signed_at INTEGER NOT NULL,document_sha256 TEXT NOT NULL,pdf_base64 TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_onboarding(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,require_password_change INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_contract_signature BEFORE UPDATE ON contract_signatures BEGIN SELECT RAISE(ABORT,'Signed agreements cannot be changed'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_contract_template BEFORE UPDATE ON contract_templates BEGIN SELECT RAISE(ABORT,'Contract versions cannot be changed'); END;
