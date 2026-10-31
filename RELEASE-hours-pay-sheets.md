# Hours approval, project pay basis and spreadsheet tracker

Adds admin Approve hours / Return hours buttons to Overview and Task log.
An hours review is bound to linked time records: changing hours invalidates it.
Existing approved weekly hours remain approved until an explicit task-hours review replaces them.

Projects choose one basis: per task, per video hour, or per working hour.
Task/video earnings use task approval; working-hour earnings use hours approval.
Existing rates are preserved. New task and time records capture the current basis/rate.
Skipped tasks do not earn task/video pay. Payroll is an estimate, not a payout action.

## Deployment order

1. Run npm run db:migrate with the production Turso environment. The additive
   migration must finish before this app version starts serving requests.
2. Deploy the reviewed app commit.
3. Verify hours approval, project creation and all three pay methods.

The migration adds columns and a review table; it does not delete or rewrite existing work.
Roll back the app if needed; leave additive columns in place.

## Google Sheets connection

Runtime configuration is separate from the ChatGPT Google Drive connection.
Configure GOOGLE_SERVICE_ACCOUNT_JSON securely in Vercel, enable the Sheets API,
and share a dedicated tracker with that service account as Editor.
Never commit the service-account key.

Set the workspace spreadsheet ID in Settings, or a project-specific spreadsheet ID
in the project editor. Work accounts may choose tab names; otherwise Task log is used.
The app creates missing tabs and writes headers only into empty tabs.
Existing nonmatching headers are refused. Columns A:P are app-managed.
Rows include task inputs, linked working time, hours approval, captured pay basis/rate,
estimated and approved pay. Credentials and login/session data are never exported.

Saving task logs, linked time, hour reviews and metadata queues updates.
The app attempts immediate sync; failures remain queued. Use Settings → Sync pending
to retry after resolving credentials/sharing errors. This is one-way Workhub → Sheets.
No live Google workbook has been created or connected as part of this source change.

## Validation

- Unit and SQLite tests.
- API integration tests (64 checks), including admin authorization and stale hour reviews.
- Mock Sheets checks for headers, project routing, leading-zero IDs,
  append/update idempotency, pay values and failed-write queue state.
- Next.js production build and TypeScript checks.
