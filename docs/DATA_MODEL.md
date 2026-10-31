# Confirmed data model

All timestamps are UTC epoch milliseconds. Calendar dates and Monday-start week keys are computed in **Asia/Manila**. Money is stored as integer Philippine centavos; durations use seconds or timestamp differences.

| Entity | Key fields | Relationships and integrity |
| --- | --- | --- |
| users | id, name, email, password_hash, google_sub, role, active | Unique normalized email and Google subject; ADMIN or EMPLOYEE |
| projects | id, name, description, status, hourly_target, rate_cents, color | Active/archived; optional weekly team-hour target |
| project_assignments | project_id, user_id | Unique pair; employees can use only assigned active projects |
| accounts | id, project_id, name, active, sheet_tab | Work accounts, not login identities; unique name within a project |
| account_assignments | account_id, user_id | Unique pair; employee must already belong to the project |
| task_entries | id, date, project_id, account_id, user_id, video_id, duration_seconds, status, notes, version | Exact unique project/account/video ID; optimistic version prevents stale writes |
| time_entries | id, user_id, project_id, task_id?, start_ms, end_ms?, rate_cents, source, notes | Null end means running timer; partial unique index permits one per employee; overlap triggers |
| timesheets | id, user_id, week_start, start_ms, end_ms, status, comment, reviewed_by | Unique employee/week; submitted/approved weeks lock records |
| audit_log | id, actor_id, entity, entity_id, action, before_json, after_json, created_at | Append-only through the application; no API for audit edits/deletes |
| sessions | token_hash, user_id, last_seen, expires_at | Hashed random session token, inactivity and absolute expiration |
| login_attempts | key, attempts, reset_at | Account/IP login throttling |
| oauth_states | state_hash, verifier, expires_at | One-use OAuth state and PKCE verifier; 10-minute expiry |
| sync_jobs | task_id, status, attempts, last_error, updated_at | Durable outbox; coalesces task edits and pending sync attempts |
| settings | key, value | Tracker spreadsheet ID and expiring sync lease; no credentials |

## Sources of truth

1. `task_entries.duration_seconds` is the length of source media.
2. `time_entries` are the only source of tracked work and pay. A task's displayed time is SUM(linked finished time intervals).
3. `timesheets` are approval envelopes over weekly time, not copies of time rows.
4. `audit_log` records task, time, membership, configuration and review mutations in the same database batch as the mutation.
5. Google Sheets is an outbound reporting copy. Manual changes in the Sheet are not imported.

The executable schema is `db/schema.ts`. The full SQLite DDL plus concurrency/locking triggers is `drizzle/0000_brainy_aaron_stack.sql`. Drizzle metadata tracks table structure; custom triggers live in the SQL migration and must be retained in future migrations. Applied migration files are immutable.
