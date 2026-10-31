# Administrator guide

1. Sign in with the administrator email and password configured by your operator, or use Google after OAuth is configured. The operator initializes your account through server environment secrets.
2. In **Team**, add employees using the exact email they will use to sign in. Assign a private initial password, or leave it blank when Google sign-in is configured. No invitation email is sent. Use a secure channel to share initial credentials; employees can change their own password in Settings.
3. In **Projects**, create the project, hourly rate in PHP, optional weekly team-hour target, and assigned employees. Add work accounts for that project, then assign the relevant employees. Every project needs at least one work account; use a General account if the project has no named tracker tabs.
4. Employees log tasks and time. Open a task to set APPROVED or RETURNED; add useful feedback in Notes. Use the duplicate warning's **Open existing entry** action instead of creating another row. Another employee's entry is visible to coordinators only.
5. In **Timesheets**, choose an employee and week. Review their daily/project totals. Approve a submitted week, or send it back with a required comment. Return an approved week before correcting it. A stopped timer is required for submission; submitted weeks lock task edits as well as time edits.
6. Use Overview and Task log filters for date range, project, employee, account and status. Click column headings to sort, search by task ID/name/notes, and use pagination. Task log includes summaries by employee, project or account. Exports respect filters.
7. Payroll shows estimated gross hourly earnings and the approved subset. Captured rates preserve historical pay when project rates change. Arrange deductions, statutory payroll, overtime policy and payouts separately.
8. Configure Google Sheets in Settings only after following `GOOGLE_SETUP.md`. Check queued/error counts and use **Sync pending** to retry in batches of three. New tasks attempt an immediate sync; failures never undo a successful task save. Time edits queue refreshed totals for the next sync.
9. Deactivate departed employees in Team and archive completed projects. These preserve history. Changing an employee account revokes its sessions. Password resets are handled through Team, not email links.
10. Review Settings → Workspace history for who changed what and when. Passwords and Google service-account secrets are never recorded in audit values.

