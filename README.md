# Aces Intelligence Workhub

White-and-blue task and time tracking for annotation teams, with Asia/Manila dates. The website opens on sign-in. Employees see their own assigned work; administrators manage projects, people, reviews, reports and payroll. Sign out is available in the top bar and Settings.

## Stack and data model

Next.js App Router, React, TypeScript, Tailwind, Zod and Drizzle schema. Production storage is remote Turso/libSQL; local SQLite is for development only. Server-side authorization protects all workspace operations.

Core tables: users, projects, accounts, task_entries, time_entries, timesheets, audit_log. Supporting tables store project/account assignments, sessions, OAuth state, login attempts, Sheets sync jobs and settings. See db/schema.ts and drizzle/0000_brainy_aaron_stack.sql, including overlap and timesheet-lock triggers.

## Local setup

Use Node 24 and pnpm 11.25.0.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:migrate
```

Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD_HASH in .env.local. Generate a hash without putting the password in shell history:

```sh
read -rs -p "Admin password: " WORKHUB_PASSWORD
printf '%s' "$WORKHUB_PASSWORD" | node scripts/hash-password.mjs
unset WORKHUB_PASSWORD
```

Copy the resulting hash into ADMIN_PASSWORD_HASH, then run pnpm dev and visit http://localhost:3000. Use the original password to sign in. Admin provisioning creates a missing account only; changing the environment hash does not reset an existing password or promote an employee.

Passwords are salted and hashed. Sessions expire after 30 minutes idle or 12 hours total. Sign-out deletes the server session. Password changes revoke existing sessions.

## Vercel deployment

See [deployment instructions](docs/VERCEL_MIGRATION.md). Required production variables are APP_URL, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD_HASH. Google login additionally requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. These are server secrets: never prefix them with NEXT_PUBLIC_.

## Seed and checks

For an empty local migrated database, set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD and SEED_EMPLOYEE_PASSWORD in .env.local, then run pnpm seed. It creates an admin, three employees, two projects, work accounts and synthetic entries. No default passwords are included; remote production seeding is refused.

```sh
pnpm test
pnpm test:integration
pnpm typecheck
pnpm build
```

Integration checks use a fresh temporary libSQL database and exercise the actual API handler. Google OAuth and Sheets require external credentials and a separate live smoke test.

## Project structure

- app/: sign-in, dashboard, forms, responsive styles and API route.
- lib/api.ts: validation, authorization and workflow operations.
- lib/auth.ts: password hashing, cookie sessions and CSRF.
- lib/database.ts: persistent database connection and atomic batch adapter.
- lib/core.mjs: durations, Manila dates, duplicate rules and exports.
- lib/sheets.ts: Google Sheets sync with durable retry records.
- db/ and drizzle/: typed schema and SQL migrations.
- scripts/: migrations, password hashing and development seed.
- tests/: unit, database and API integration checks.
- docs/: admin, employee and deployment guides.

Google Sheets sync requires a service account with access to the tracker, a spreadsheet ID in Settings, and tab names for each work account. Columns A:E are DATE, VIDEO ID, DURATION, STATUS, ANNOTATOR; F:J must be PROJECT, ACCOUNT, TIME SPENT, NOTES, WORKHUB ID. Back up your existing tracker before connecting it. Saves queue sync work; Settings can retry failed jobs.

Time entries snapshot project hourly rates. Payroll summaries total recorded time at those rates; they do not calculate taxes, statutory deductions or send payments.
