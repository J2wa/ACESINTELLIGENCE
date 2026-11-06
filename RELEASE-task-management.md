# Employee task edits and safe bulk deletion

Implemented against main commit 00139f538d04c989bcc9a493febc087bb1faea2f.

## Behavior

- Employees can edit their own unapproved, uninvoiced tasks, including switching to an active assigned account in the same project. Project and annotator remain fixed. Server checks assignment, duplicates, version, invoice links, timers, timesheets and approved hours in a write transaction.
- Single and bulk deletion share one transactional implementation. Normal deletion requires the current Asia/Manila work-date month, an unapproved task, no invoice links, no running/paid linked time, no finalized timesheet and no approved hours review. The same deletion safeguards apply to administrators. Existing separate archive/accounting workflows are unchanged.
- Bulk deletion accepts 1–100 unique IDs with versions and rolls back the entire batch on any failure, including audit/outbox/time cleanup. Task IDs identify eligibility failures.
- Task log has separate deletion checkboxes, select-all for the visible page, selected count, disabled reasons and a keyboard-accessible native confirmation dialog listing task IDs and unpaid time cleanup. Admin approval selection remains separate.
- Account moves queue old-destination spreadsheet removal. New-destination upserts wait until removal succeeds. A second account move/deletion waits for pending cleanup, preventing its destination from being overwritten.
- Payment triggers remain intact. No schema change or production data migration is needed.

## Changed areas

- `lib/task-mutations.ts`: transactional edit/delete authorization and cleanup.
- `lib/api.ts`: routing and workspace lock hints.
- `lib/task-eligibility.mjs`: UI eligibility hints and Manila month handling.
- `lib/sheets.ts`: old-destination cleanup ordering.
- `app/page.tsx`, `components/task-delete-dialog.tsx`, `app/globals.css`: selection, account editing, confirmation and styling.
- `tests/integration.mjs`, `tests/payroll.integration.mjs`, `tests/sheets.integration.mjs`, `tests/task-eligibility.test.mjs`: regression coverage.

## Verification

- `pnpm typecheck`: passed.
- `pnpm test`: 48 passed.
- `pnpm test:integration`: 326 checks passed, including assignment/account edits, duplicates, cross-owner rejection, stale selection after approval, month locks, mixed-batch rollback, audit/outbox persistence and existing approval/upload/timer/session workflows.
- `pnpm test:payroll`: 153 checks passed, including mixed paid/unpaid bulk rollback, immutable invoices, exports, stale payment previews and payroll rollback.
- `pnpm test:sheets`: passed against mocked Google endpoints, including failed-removal ordering and retry.
- `pnpm build`: passed.
- `pnpm lint`: fails with 63 errors and 27 warnings. An untouched baseline checkout reports the same 63 errors and 27 warnings. Newly introduced modules pass targeted ESLint.
- No authenticated browser, mobile interaction or real Google Sheets account test was performed. No production records were used for testing.

Publication and deployment status must be checked independently against the resulting commit.
