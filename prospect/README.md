# ACES Prospect AI — audited team workflow

Source: J2wa/ACESINTELLIGENCE, branch `audit/plan-alignment`, directory `prospect`. Vercel framework Other, output `public`, build `npm run build`, Node 24. This audit is prepared on a preview; production rollout waits for the shared CRM decision.

## Quick review (no keys or costs)
Open `/workspace.html`, choose **Explore dry run**. Use synthetic fixtures only. Clock is fixed at November 2, 2026, 10:00 Manila. Switch simulated seats to check access gates. No emails, LinkedIn messages or paid API calls occur. Data resets on reload. `npm run test:dry-run` exercises ten fixture leads end to end.

## Install and test
```
npm ci --ignore-scripts
npm test
npm run lint
npm run build
npm run test:dry-run
```
Tests include exact weights, recency, seven stage gates, BANT-lite, suppression, approval invalidation, six reply labels, working-hour SLA, deliverability, access checks, public LinkedIn adapter mocks, 40 mock prompt-contract checks, an in-memory libSQL migration/concurrency check, and a 35A/15B daily pipeline simulation. No live provider credentials are used. Syntax lint is not semantic ESLint.

## Activate a shared workspace (founder decision required)
1. Approve a separate Turso/libSQL database for prospect records. Existing Workhub uses libSQL, but this app must use its own credentials. Do not point it at Workhub without separate authorization. No production data has been migrated.
2. Set `PROSPECT_DATABASE_URL` and `PROSPECT_DATABASE_TOKEN` in Vercel. After approval, run the additive migration with `PROSPECT_MIGRATION_APPROVED=yes npm run db:migrate`. Rollback is an app/config rollback; preserve the new table and records, never drop data.
3. Configure `PROSPECT_SEATS_JSON` as an array of objects with id, role (founder/va1/va2/ai1/ai2), tokenHash (SHA256 of a random 32+ character token), disabled (false). Generate and distribute tokens privately; do not paste them into issues or source. Hashes only go in server configuration. Disabling a seat takes effect on the next request.
4. Founder sets country allowlist, Manila work window, a separate sending domain, sender address/contact, DNS attestation and mailbox start date. Defaults exclude Canada and EU markets. This does not certify legal compliance or verify DNS automatically.
5. Populate `config/fact_sheet.yaml` with exact approved claims. The empty template approves none. Provide the do-not-contact list before import. UI suppression is append-only; email/domain match applies across tracks.
6. Existing browser records are retained, not silently deleted or migrated. Export them from the old page and explicitly review/import them into the shared CRM. New research requires seat authentication and saves server-side. Research key remains in tab memory.

## LinkedIn change
The old blanket scraping ban is replaced by an optional **public business data** adapter in `core/linkedin.js`. Choose an Apify Actor that explicitly accepts `startUrls: [{url}], maxItems, publicOnly`; verify its real input schema and output shape before activation. No actor is selected automatically. Set `APIFY_LINKEDIN_ACTOR_ID`, `APIFY_TOKEN`, and only after approval `PROSPECT_LIVE_PROVIDERS=true`. POST `/api/linkedin` with a research/founder bearer token: action `validate` checks 1–15 public URLs; `start` additionally requires `confirmPaidRun:true`; `status` reads the run. No private profiles, account cookies, logins, access bypasses or automated outreach. Adapter contract is mock-tested, not a verified live scrape. https://docs.apify.com/api/v2/actor-runs

## Daily operations
- AI1/research seat imports cited candidates, checks verification evidence and advances only eligible contacts. Scores below 60 stay Candidate; 80+ gets founder/custom-message review. Unknown evidence cannot be promoted.
- VA1 edits seven-touch drafts, inserts the actual verified trigger in the first email line, approves each draft, schedules a human task, then records the external human action. No send connector exists. Approval is invalidated when the message or lead changes.
- VA2 opens Replies first, handles positive replies before the two-working-hour deadline, captures BANT-lite and records calendar/handoff evidence. Generate the founder call brief from the lead.
- Founder reviews hot leads daily; on Wednesday inspect sampled sent/draft messages and record feedback; on Friday generate the funnel report. Empty metrics are not fabricated.
- Daily/weekly buttons run idempotent maintenance. `core/orchestrator.js` supports injected providers and is tested at 35A/15B, but no unattended live scheduler is activated. Missing verifier, inbox/calendar integrations and recovery infrastructure are listed in the audit matrix.

## Security and storage limits
Shared CRM stores one versioned JSON state record with optimistic concurrency; suitable for initial team testing, not an unbounded high-volume CRM. Per-seat role checks are server-side. Tokens/AI keys remain in tab memory. Browser demo is stateless and accepts synthetic fixture names only. Existing localStorage records remain for explicit migration. No deletion endpoint, no real send endpoint. External requests have timeouts and no automatic paid retries. API quotas, distributed abuse controls and live monitoring still need production hardening.

See `docs/audit/05-final-report.md`, the requirement matrix and recorded test output for verified behavior and remaining gaps.


### Approved setup and provider controls (Nov 1 update)

The founder approved the separate database and function changes. Provision a separate Turso/libSQL database and set `PROSPECT_DATABASE_URL`, `PROSPECT_DATABASE_TOKEN`, and `PROSPECT_SEATS_JSON` as encrypted Vercel variables. Do not reuse the Workhub database. Set `PROSPECT_MIGRATION_APPROVED=yes` during setup, enter a founder token on `/workspace.html`, and click **Initialize approved database**. The additive operation preserves existing CRM records and creates a provider-run ledger. Return the migration flag to `no` afterward. `/api/setup` reports configuration booleans only; it does not disclose credentials or prove database connectivity.

The LinkedIn screen now supports explicit start, status/results, and reviewed JSON import. Configure a compatible Actor and provider token before enabling live providers. A durable request reservation prevents the same request ID from causing a second paid run, caps starts at five per hour across the workspace, and restricts results to the owner/founder. If a provider call times out, reconcile its outcome in Apify; do not create a fresh request to work around an unknown outcome. No live provider requests were used during implementation.

Qualification uses labeled fields and signal checkboxes. Logged replies can reference a specific sent draft. **Export CRM backup** downloads the current state, including contact data: store it securely. This manual export is not automated disaster recovery.

The connected Vercel toolset cannot create a Turso resource, and the browser provisioning dashboard requires sign-in. Database provisioning and live deployed verification remain pending account access. Automated coverage: 69 passing tests, including setup authorization, additive initialization, provider ownership, hourly cap and duplicate-request protection. Other previously recorded limitations remain in the audit gap plan.
