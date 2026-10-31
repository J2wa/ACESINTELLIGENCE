# GitHub and Vercel deployment

This branch uses Next.js with the Node runtime and a remote Turso/libSQL database. The earlier Cloudflare deployment is separate and is not modified by importing this repository.

1. Push this source to the private GitHub repository J2wa/ACESINTELLIGENCE.
2. Create a Turso database and database auth token. Keep the token private.
3. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in a secure local environment and run pnpm db:migrate once before production starts. Migration checksums and completion records prevent accidental reapplication. Do not point production at a local file database.
4. Import the GitHub repository into Vercel. Framework: Next.js; Node: 24; build: pnpm build; install: pnpm install --frozen-lockfile. Use the default Next.js output directory.
5. Add production environment variables from .env.example: APP_URL (exact HTTPS origin), TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD_HASH. Generate the hash with scripts/hash-password.mjs. Do not paste the plaintext password into source or chat.
6. For Google sign-in, create a Google OAuth web client. Register https://YOUR-DOMAIN/api/auth/google/callback exactly and set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel. Match APP_URL to that domain. Keep GOOGLE_ONLY=false until Google sign-in works.
7. Deploy. Sign in as the configured admin, add employees with their verified Google email, assign projects/accounts, then verify task saving and sign-out. Unknown Google users cannot self-register.
8. Use a separate database for Vercel preview deployments. Apply future migrations before releasing code that needs them.

Environment changes require a new deployment. ADMIN_PASSWORD_HASH initializes only a missing admin; use Change password for existing accounts. Workhub rejects platform identity headers as a bootstrap mechanism on Vercel.

Google Sheets is optional: set GOOGLE_SERVICE_ACCOUNT_JSON, share the tracker with that service account, then configure the spreadsheet and tabs in Settings/Projects.

The code has local build and API tests. A remote Turso connection, real Google OAuth, Google Sheets and a live Vercel deployment still need configured provider accounts and live verification.
