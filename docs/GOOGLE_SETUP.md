# Google sign-in and tracker sync

These integrations are implemented but require your own Google project and tracker configuration. The app does not ask ChatGPT to store your Google password. Runtime secrets stay outside source and exports.

## Google sign-in

1. Create a Google Cloud project, configure its OAuth consent screen, and create a **Web application** OAuth client. Add authorized test users if the consent screen is in testing mode; publish/verify the consent screen as required by your deployment.
2. Set the exact authorized redirect URI to `https://YOUR-WORKHUB-HOST/api/auth/google/callback`. For local development, use the matching localhost origin.
3. Set server variables `APP_URL` (origin only, no trailing slash), `GOOGLE_CLIENT_ID`, and secret `GOOGLE_CLIENT_SECRET`. Redeploy to apply hosted configuration.
4. In Team, add each employee's exact verified Google email. The callback never auto-registers unknown users or promotes them to admin. It links the verified email to Google's stable subject and rejects mismatched subjects.
5. Test the login flow before setting `GOOGLE_ONLY=true`. That setting disables email/password sign-in; keep administrative access and an environment rollback path available. The first workspace setup still requires establishing an administrator.

The authorization-code flow uses an HttpOnly state cookie, one-use hashed state, PKCE, token exchange on the server, and Google's HTTPS userinfo endpoint. It requests openid/email/profile only. Tokens are not persisted in the browser or database. Google Sheets uses a separate service account, so annotators do not consent to Sheets access.

Official references: [Google web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## Google Sheets sync

1. Enable the Google Sheets API in your Google Cloud project. Create a service account and its JSON key. Save the complete JSON as the secret `GOOGLE_SERVICE_ACCOUNT_JSON` in your server environment. Never paste it into the UI or a spreadsheet.
2. Share the existing tracker spreadsheet with the service account's `client_email` as Editor. Do not make the sheet public. This uses only a Sheets API scope, not general Drive access.
3. Prepare the destination tracker tabs. Preserve/move existing summary columns before reserving columns A–J for the app. Row 1 must contain headers in the order below. The app checks F–J headers before writing; incompatible tabs are reported as errors instead of overwriting their unrelated columns.

| Column | Header | Value |
| --- | --- | --- |
| A | DATE | Manila date, YYYY-MM-DD |
| B | VIDEO ID | Exact original string |
| C | DURATION (h:mm:ss) | Video length |
| D | STATUS | Task review status |
| E | ANNOTATOR | Employee name |
| F | PROJECT | Project name |
| G | ACCOUNT | Work account name |
| H | TIME SPENT | Finished linked working time, h:mm:ss |
| I | NOTES | Task notes |
| J | WORKHUB ID | Stable app task identifier used for updates and retries |

4. In Settings → Google Sheets sync, enter the spreadsheet ID between `/d/` and `/edit` in the Google Sheets URL. In Projects → Work accounts, enter each account's exact existing tab name. Tabs must already exist.
5. Save a test task and verify it arrives on the correct tab with its leading zeroes intact. Updates locate column J and rewrite the same row. Existing historical tracker rows without Workhub IDs are not matched/imported automatically; plan any historical import separately.
6. New task saves enqueue a durable job and attempt a sync. Errors remain visible in Settings. **Sync pending** processes up to three jobs per click. Fix tab/permission/configuration problems, then retry. Linked working-time edits also queue a refreshed row. An unattended cron retry is not enabled in this version.

Writes use Google Sheets `RAW`, preserving text IDs and preventing strings from becoming formulas. An expiring database lease serializes sync attempts. Before appending, a retry looks for the Workhub ID to recover a previous successful append whose response was lost. Do not delete/edit column J values. A rare network ambiguity or manual sheet changes still require checking the tracker; the app is the authoritative record.

Official references: [Reading/writing values](https://developers.google.com/workspace/sheets/api/guides/values), [RAW value updates](https://developers.google.com/workspace/sheets/api/samples/writing).
