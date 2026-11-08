CREATE TABLE IF NOT EXISTS task_pool_details (
 pool_id TEXT PRIMARY KEY REFERENCES task_pool(id) ON DELETE CASCADE,
 english_subtitles INTEGER CHECK(english_subtitles IN (0,1)),
 extension_hours INTEGER, extension_reason TEXT, extension_status TEXT,
 requested_by TEXT REFERENCES users(id)
);
