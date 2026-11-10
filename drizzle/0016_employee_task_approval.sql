CREATE TABLE IF NOT EXISTS project_employee_approval (project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)));
