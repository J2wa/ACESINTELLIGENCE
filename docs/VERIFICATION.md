# Verification

- Next.js production build: passed.
- TypeScript typecheck: passed.
- Unit and SQLite integrity tests: 12 passed.
- Node/libSQL API checks: 44 passed against an isolated database.

API checks cover role and assignment restrictions, employee-scoped data, duplicate detection, invalid durations, stale edits, overlapping time, timesheet locks and review, exports, audits, CSRF, password session revocation, admin provisioning from environment hashes, prevention of employee promotion by bootstrap, and sign-out.

The earlier Cloudflare edition had browser checks for task saving, duplicate updates and timers. The migrated white-and-blue Next.js edition has not yet had browser verification. Remote Turso, Google OAuth, Google Sheets and Vercel deployment require provider configuration and live smoke tests. Payroll is an estimate before deductions.
