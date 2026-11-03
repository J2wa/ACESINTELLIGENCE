CREATE TABLE IF NOT EXISTS user_presence (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, last_active_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS session_presence (token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE, last_active_at INTEGER NOT NULL);
