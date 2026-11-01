# Administrator guide

1. Sign in with the administrator email and password configured by your operator, or use Google after OAuth is configured. The operator initializes your account through server environment secrets.
2. In **Team**, add employees using the exact email they will use to sign in. Assign a private initial password, or leave it blank when Google sign-in is configured. No invitation email is sent. Use a secure channel to share initial credentials; employees can change their own password in Settings.
3. In **Projects**, create the project, hourly rate in PHP, optional weekly team-hour target, and assigned employees. Add work accounts for that project, then assign the relevant employees. Every project needs at least one work account; use a General account if the project has no named tracker tabs.
4. Admins can log tasks for any active employee using the Annotator selector, including in Mass upload. The selected employee owns the task and any working minutes; the admin remains the audit actor. Open a task to set APPROVED or RETURNED; add useful feedback in Notes. Use the duplicate warning's **Open existing entry** action instead of creating another row. Another employee's entry is visible to coordinators only.
5. In **Timesheets**, choose an employee and week. Review their daily/project totals. Approve a submitted week, or send it back with a required comment. Return an approved week before correcting it. A stopped timer is required for submission; submitted weeks lock task edits as well as time edits.
6. Use Overview and Task log filters for date range, project, employee, account and status. Click column headings to sort, search by task ID/name/notes, and use pagination. Task log includes summaries by employee, project or account. Exports respect filters.
7. Payroll shows estimated gross hourly earnings and the approved subset. Captured rates preserve historical pay when project rates change. Arrange deductions, statutory payroll, overtime policy and payouts separately.
8. Configure Google Sheets in Settings only after following `GOOGLE_SETUP.md`. Check queued/error counts and use **Sync pending** to retry in batches of three. New tasks attempt an immediate sync; failures never undo a successful task save. Time edits queue refreshed totals for the next sync.
9. Deactivate departed employees in Team and archive completed projects. These preserve history. Changing an employee account revokes its sessions. Password resets are handled through Team, not email links.
10. Review Settings → Workspace history for who changed what and when. Passwords and Google service-account secrets are never recorded in audit values.


## Record approved pay

Open Payroll, set the employee/project/date filters, and choose **Pay approved pay**. Review the total, employees, and included work, optionally add a payment reference and notes, then choose **Confirm paid** to record the completed payment. One invoice is created per employee. This action records payment in Workhub; fund transfers are handled outside Workhub.

Task payments include the entire task and its linked hours. Unlinked project-time entries must fall entirely within the selected dates. Pending work, running timers, and already-paid work are excluded. Payment recording rechecks the preview inside a write transaction and safely handles retries.

Paid tasks and hours are read-only, including through the API. Payment invoices retain the original employee, project, account, rate, units, work dates, and amounts. Use **Invoices & payment history** to inspect an invoice, export its PDF, or download its CSV.

Lifetime and monthly earnings include paid amounts plus unpaid approved earnings. Monthly earnings use the work date, while invoices show the payment date. Earnings totals ignore the date/project filters and follow the selected employee.

## Delete logs and choose task fields

Admins can delete any employee's unpaid task or time log using the trash button. Employees can delete only their own logs. Task deletion also removes linked working time, hour reviews, and queued tracker writes in one transaction, with audit history preserved. Google Sheets row removal uses the stable entry ID and retries automatically while an administrator has Workhub open. Paid logs remain locked; submitted/approved weeks must be returned first, and running timers must be stopped.

Task forms and bulk columns follow **Per task**, **Per video hour**, or **Per working hour**. Project cards display this pay basis instead of guessing an annotation type from the project name. Existing task editors use the task's captured pay basis even if the project basis has since changed.

## Enable the work timer for a project

Open **Projects → Manage → Time tracking**, check **Enable time tracking**, then save. Only administrators can change this setting. Existing and new projects start disabled until explicitly enabled. The timer project selector includes only active projects with time tracking enabled, and employees still need a project assignment.

Disabling time tracking blocks new timer sessions, including direct API requests. A running session can still be stopped and saved. The setting applies to the work timer; task logging and manual working-time entry keep their existing permissions. Changes appear in workspace audit history.

## Continuous Google Sheets sync

With the service account configured, an administrator’s open Workhub automatically processes queued rows in small batches, waiting 10 seconds between successful batches. It checks for new work every 30 seconds when caught up. Failed requests retry with increasing delays, up to five minutes. Settings shows current progress and a **Sync now** button for an immediate retry.

Keep Workhub open and signed in to drain a large queue. Closing the browser or session expiry stops the continuous worker; reopening and signing in resumes it. Background polling does not extend the 30-minute idle session. Individual saves still attempt immediate sync as before.

## Delete and restore records

Administrators can select **Delete** on project cards, employee rows in Team, and invoices in Payroll. A confirmation explains the effect. Enable **Show deleted** to see deleted records and use **Restore**. These actions are audited and preserve all linked tasks, hours, assignments, and payment history.

Deleting an employee disables sign-in and revokes their sessions. Only employee accounts can be deleted; administrator accounts are protected. Deleting a project archives it and prevents new work. Stop any running timers first. Restore returns the previous active/inactive or project status.

Deleting an invoice hides it from the normal invoice list. It does not void a payment, reduce paid totals, release paid-work locks, or make the work payable again. Its original details and exports remain available.

## Client rates and company profit

When creating or editing a project, enter **Employee rate** and **Client rate** in PHP. Both use the project’s pay basis: per task, per video hour, or per working hour. The form shows the difference per unit; rates below employee pay correctly show a loss. Existing employee rates remain unchanged.

The admin-only **Company profit** dashboard shows client revenue, employee pay, and gross profit for approved or paid work, with date, project, employee, account, and status filters. Revenue means the value of approved work, not client cash received. Profit excludes other business costs. Both totals use the same priced work, and paid work is counted once.

Rates are captured when tasks or time entries are created. Linked hours use the task’s captured client rate. Project rate edits affect future work, not historical profit. Old entries without captured client rates are marked unpriced and excluded from both revenue and cost totals in this dashboard. They remain fully included in employee payroll. A zero client rate is valid and is not treated as missing. Client rates and profit data are not sent in employee workspace responses or the shared Sheets tracker.

## Mobile navigation and appearance

On phones and tablets, use **Menu** to open navigation and **Close menu** or the dimmed backdrop to dismiss it. Choosing a page closes the menu. Keyboard users can press Escape, and focus stays inside the open drawer. On desktop, **Hide sidebar** provides more workspace; the header menu button brings it back. Mobile page actions appear below the title, forms use a single column, and wide tables scroll inside their cards. The theme toggle switches between light mode and navy-blue dark mode.

## Project archive
In Projects, use Archive project to close it to new work. Project archive includes older archived/deleted projects; Restore project reopens it. Empty archive opens a two-step dialog: export the PDF backup, confirm it was saved, then type `EMPTY ARCHIVE` to permanently remove the selected projects, task/time records, accounts and assignments.

Administrators can include paid work and submitted/approved timesheet entries. The server requires an export receipt bound to the administrator and exact records, expiring after 15 minutes and usable once. Changes after export require a new PDF. Running timers must still be stopped. Affected locked timesheets are returned for review; remaining work is retained. Payment invoices and invoice line snapshots stay immutable and available for historical totals and PDF downloads. Audit events remain, and linked spreadsheet rows are queued for removal. Deletion and receipt consumption are atomic: failures leave everything unchanged.

Team and invoice Delete actions use styled confirmation dialogs and remain recoverable through Show deleted. No export is needed for those visibility changes.
