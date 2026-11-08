# Optional task claiming

Built from `ef618d1` (source tree identical to reference `a165fe9`). No URL routing changes. The architecture reference matches the single-page layout; its deployment SHA is historical. Existing Help still describes Sheets A:J although the implementation uses A:P; claiming leaves that schema unchanged.

## Administration and employees

Projects → Manage → Enable task claiming (off by default). Deadline: 1–720 integer hours, default 24. Max active claims: 1–1000 per employee **per project**, default 1. Disabled claiming stops new claims only; settings changes never alter existing deadlines. Task pool management is in Projects. Import up to 100 tab-separated rows without headers: exact task ID, optional h:mm:ss video duration, optional notes. All rows commit or none do. Cancelled IDs remain reserved; add a distinct ID for different work.

Employees see available work by assigned project/account in Overview and Task log, plus their own active claims. Both assignments, an active employee/project/account and enabled claiming are required to claim. Claimed tasks are ordinary PENDING tasks with captured project employee rate/pay basis (and existing client-rate capture trigger). Task IDs preserve leading zeros. Concurrent claims use a versioned conditional AVAILABLE update in a write transaction. Limits count overdue claims too.

The explicit **Submit claimed task** action marks only the pool record COMPLETED and stops its countdown. It does not approve task status/hours, create a payment, change captured rates or unlock work. Stop linked timers first. Submission must reach the server strictly before deadline; at the deadline expiry wins. An overdue retained claim requires an administrator's reasoned extension before submission. Completed claims stay completed even if QA subsequently returns the task; corrections use the existing task workflow without a new claim deadline.

Existing owners can release/submit after claiming is disabled, provided they are still active and assigned to both project and account. Administrators can extend or release on their behalf. Admin force-release never bypasses work protections. Extensions add 1–720 hours to the later of now or the existing deadline and require a nonblank reason. All claim actions and prior owners are retained in audit_log.

## Expiry and release safety

`expireOverdueClaims(now, tx)` runs inside the write transaction for claims, releases, completion, admin pool actions and workspace snapshots (also exports through the snapshot). UTC milliseconds are authoritative; display uses Asia/Manila. No background service or cron is required.

Automatic expiry releases only an untouched PENDING task (version 1), with **no logged time of any kind**, approved-hour review, invoice/payment links, submitted/approved task week, or pending prior tracker removal. Edited tasks, skipped/returned/approved tasks, and any protected work stay CLAIMED with overdue=1. Marking overdue is idempotent and emits one audit event; it never silently re-releases later if someone removes its time. Admin review is required. Lifetime automatic-expiry counts and current overdue counts appear in admin Overview.

Voluntary/admin releases use the same safety checks, except explicitly releasing an edited PENDING task is allowed. Notes are removed with its task entry, so the UI asks for confirmation. Logged time must first be removed through the existing time workflow if eligible; release itself never removes time. Unlike normal task deletion, an empty claim may be released across a Manila month boundary. This prevents old-month untouched work becoming permanently stuck. Existing normal deletion rules remain unchanged.

Release unlinks the pool item, deletes the empty task and review/update job, preserves audit history, and queues the existing stable-ID Sheets deletion outbox when a tracker is configured. A new claimer gets a new Workhub task ID. Sheets remains A:P with the existing normal queue processor.

New additive triggers reserve pool IDs against manual single/bulk creation and task identity edits. Linked pooled tasks cannot be deleted through ordinary task-delete endpoints; use Release. Pooled task project/account/ID/owner are fixed even after submission. Employee snapshots exclude other employees' claims, creator IDs, expiry history and client rates.

## Schema and deployment

Migration `0012_task_claiming.sql` and matching idempotent `ensureClaimsSchema` add settings, pool and guard/index definitions. `0011` is deliberately not reused: routing was reverted but its tables/migration marker may still exist in production. No existing trigger is dropped/replaced. The lightweight archive scope table is ensured for installations that have not run archive bootstrap. Pool links are guarded rather than a circular foreign key, so claims can reserve their generated task ID atomically before inserting the task.

Runtime schema creation assumes the existing base schema, like the rest of Workhub. Fresh databases must run `pnpm db:migrate`. Previously applied routing tables are harmless and remain untouched. The new settings/pool tables cascade on explicit permanent project/account purge; audit records survive. Existing archive/payroll protections still control that privileged operation.

Optional future hardening: a separately authenticated Vercel Cron endpoint could open a write transaction and invoke the same expiry function. Configure a secret, bounded batches and monitoring then; no cron or public expiry endpoint is installed here. With lazy expiry, idle pools update on the next authorized request.

## Preview configuration

Deploy only the `feature/task-claiming` branch with target Preview. Never copy production database or Google service-account credentials into Preview. Configure a separate remote Turso database and token for this branch's Preview environment; apply migrations there, then create dedicated test accounts through the existing secured bootstrap process. Until configured, the build can be inspected but backend sign-in cannot work. Production remains unchanged.

## Verification

`pnpm test:integration` now includes `tests/claims.integration.mjs` after the existing 326-check suite. Claim checks cover concurrent winners, availability/version/max/assignment/active gates, settings, exact IDs, duplicate reservation in both directions, atomic imports, completion, release, outbox, expiry idempotence and protected work, no cross-employee claims, reasoned extensions and Manila month boundaries. Tests use temporary local libSQL databases. Sheets integration uses mocked Google endpoints. Real Turso/Sheets and authenticated browser acceptance must be reported separately.
