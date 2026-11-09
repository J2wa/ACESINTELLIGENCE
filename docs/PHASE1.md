# Phase 1 — reliability and security

Implemented on a review branch. No production credentials, migrations, deployment,
or production database operations are part of development verification.

## Changes

- `GET /api/tasks` returns 25 tasks by default (maximum 100), an exact filtered
  count, linked time records, and admin-only SQL work summaries. Date, employee,
  project, account, status and literal search filters run in SQL. Sort columns
  are allowlisted, and tied rows have a stable ID tie-breaker. Employee ownership
  is enforced independently of requested filters. The task table uses this API.
- Task-log workspace loads include reference records and active timers, not the
  complete task, invoice and time history. Overview and timesheets request a date
  window plus the selected week, active timers and complete linked task intervals.
  Financial, project and team views retain full reads to preserve existing lifetime
  totals. Exports and payment validation also retain complete server-side records.
  These remaining full-history reads are a scaling limit for future work; this
  change does not claim every collection is paginated or cache financial totals.
- Linked times, reviews and claims use indexed lookups/maps rather than scanning
  every time entry for each task. Migration `0015_phase1_indexes.sql` adds query
  indexes and persistent retry storage. Run all migrations in filename order.
- PBKDF2-SHA256 uses 600,000 iterations for new passwords and silently upgrades
  existing 100,000-iteration hashes after a successful login. Malformed hashes
  fail closed. Login attempts are atomically limited to 10 per account / 15 minutes
  and 100 per trusted IP / 15 minutes. Missing IP headers retain account throttling
  without a shared `local` bucket. No client-supplied generic forwarded IP is trusted.
- Settings offers “Sign out other sessions”; current-session, idle expiry, CSRF,
  account activation and password-change revocation behavior is retained.
- Mutations queue Sheets work transactionally and no longer wait for Google.
  The scheduled worker and explicit admin “Sync now” share a database lock, bounded
  batches and a 180-second network deadline. Failed upserts and deletions persist
  exponential retry delays from 30 seconds up to one hour. New record revisions
  are eligible immediately. Stable entry IDs avoid duplicate rows after retries.
  Settings shows errors and last sync activity; worker warnings appear in runtime logs.
  Optional MFA and external failure notifications are not implemented in this phase.

## Release setup (before enabling production processing)

1. Review and merge only after validation. Use an isolated preview database and
   leave `SHEETS_WORKER_ENABLED=false` in previews. Do not attach production database
   credentials to a test environment.
2. Take a consistent database backup and restore it to a new local file using the
   commands below. The archive PDF is a report, not a restorable database backup.
3. Apply migrations to the release database with `pnpm db:migrate`. Do not modify
   previously applied migration files. The added indexes are additive.
4. On Vercel, set `TRUSTED_PROXY=vercel`, a random `CRON_SECRET` (at least 32 random
   bytes), and production-only `SHEETS_WORKER_ENABLED=true`. Keep the existing
   service-account JSON and spreadsheet sharing configuration.
5. Choose a scheduler. `vercel.json` contains a daily 00:00 UTC invocation as a
   Hobby-compatible safety net. For normal operation, enable the included GitHub
   Actions schedule (every five minutes): repository variable
   `SHEETS_WORKER_ENABLED=true`, variable `WORKHUB_URL=https://workplace.acesintelligence.xyz`,
   and Actions secret `WORKHUB_CRON_SECRET` equal to production's `CRON_SECRET`.
   GitHub scheduled jobs run from the default branch and can be delayed; the daily
   fallback alone only processes a small batch and is not adequate for a busy team.
   Alternatively configure a frequent Vercel cron supported by your hosting plan.
   Both schedulers can safely overlap because the worker uses a shared lock.
6. Confirm `/api/cron/sheets` rejects requests without its bearer secret and that
   preview processing is disabled. Send one authorized invocation, then confirm
   the Settings activity timestamp and queue reduction. Test the actual Google
   integration in a dedicated staging spreadsheet before production activation.
7. Monitor queue age/errors and invocation logs. If incoming work exceeds the
   bounded batch throughput, increase scheduling frequency or adopt a dedicated
   queue worker; do not grow batches past the lock/deadline budget.

No scheduler secrets or repository variables were set during implementation.
The production worker remains inactive until release configuration is completed.

## Backup and restoration

Run on a trusted workstation with Node 24 and a database token authorized to read
all tables. `create` uses a read transaction; it does not migrate or change its source.

```sh
pnpm backup create /secure/backups/workhub-before-phase1.json
pnpm backup restore /secure/backups/workhub-before-phase1.json /secure/restore/workhub.db
```

Destination files must not exist. Restore accepts only a new local filesystem path,
never a remote database URL. The backup contains schema, every table and data types,
with a checksum. Restore loads data before reinstalling indexes/triggers and checks
row counts, foreign keys and SQLite integrity. Only restore trusted backup files:
the schema is executable SQL. Backups contain employee/payment data, password hashes,
sessions and encrypted account credentials; files are created with mode 0600.
Encrypt and retain them in your approved backup location. Preserve encryption keys
separately. Before making a restored database live, revoke restored sessions/OAuth
states, clear the transient sync lock, check the queue and disable Sheets processing
until reconciliation. Promotion to a remote database is a separate reviewed recovery
operation, deliberately not automated by this script.

## Verification

```sh
pnpm test
pnpm test:integration
pnpm test:payroll
pnpm test:sheets
pnpm test:phase1
pnpm typecheck
pnpm build
```

Tests use temporary local databases and fake Google responses. They cover existing
admin, task, bulk edit/deletion, timer, timesheet, claim, archive and payroll flows;
password compatibility/upgrades; concurrent throttle limits and header spoofing;
session revocation; pagination/filter privacy; schedule authorization; persisted
retry delays; and backup restoration with immutable invoice guards. The payroll
restore fixture compares every table value to the source, not just row counts.

A local Chromium browser smoke test passed sign-in, paginated task navigation,
search/page reset and session revocation, with no page errors; Settings was also
rendered at a 390px mobile viewport. Production-sized load, real Google credentials,
production session behavior and operational backup retention still require staging
validation before deployment. Optional MFA,
full collection pagination, summary caching and external alert delivery remain future
work. Full repository lint has pre-existing `no-explicit-any` violations: 63 errors on
the initial base commit versus 59 after Phase 1; incorporating the subsequent
task-return commit adds its existing violation, bringing the current branch to 60. No new lint error rule was introduced.

References: [Vercel request headers](https://vercel.com/docs/headers/request-headers),
[Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## Production release configuration

The connected ACES Intelligence team has Vercel Pro. The release therefore uses
a native five-minute Vercel cron and does not require enabling the GitHub Actions
schedule. Production builds first run `scripts/release-phase1.mjs`, which applies
only the eight idempotent CREATE statements in migration 0015 and verifies their
existence. It skips Vercel previews, never replays the legacy initial schema, and
does not edit or delete work/payment rows. New installations must still run the
full migration runner before this existing-installation release path. The earlier
daily-cron guidance applies only if this configuration is adapted to Hobby.
