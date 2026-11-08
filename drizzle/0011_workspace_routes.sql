CREATE TABLE IF NOT EXISTS project_urls (project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE, slug TEXT NOT NULL UNIQUE);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS project_slug_history (slug TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS employee_urls (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, slug TEXT NOT NULL UNIQUE);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS account_urls (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, slug TEXT NOT NULL UNIQUE);
