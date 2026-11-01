# Remaining gaps and activation plan

Do not migrate production or enable paid data runs before founder decisions. No real messages can be sent by this app.

| Priority | ID | Remaining work | Effort | Files / dependency |
|---|---|---|---|---|
| P1 | DISC-1 | Daily plan 35A/15B; unattended discovery and achieved volume unverified. | M | `core/crm.js:23` |
| P1 | DISC-4 | Manual evidence workflow only; no verifier account or enrichment API supplied. | L | `core/crm.js:32` |
| P1 | LINK-1 | Adapter mocked; compatible Actor/credentials/spend authorization not configured. | M | `core/linkedin.js:4` |
| P0 | CRM-2 | Prepared, local integration tested; production datastore approval/configuration pending. Existing browser records retained. | L | `core/store.js:4` |
| P0 | CRM-3 | Enforced in code; no production seat tokens provisioned. | M | `core/auth.js:3` |
| P2 | REPLY-1 | Keyword baseline; nuanced intent requires human review. No mail inbox polling. | M | `core/policy.js:55` |
| P1 | FACT-1 | Pattern scanner plus review is not a semantic guarantee against every paraphrase. | M | `core/policy.js:38` |
| P1 | PROMPT-2 | 20+20 mocked contract checks; live model quality not evaluated without authorized test key. | M | `tests/prompts.test.js:2` |
| P1 | DELIV-1 | Configured attestation gate; actual DNS/warmup not independently verified. | M | `core/policy.js:59` |
| P1 | DELIV-3 | Guard blocks recorded contacts; actual inbox/bounce/complaint ingestion requires provider. | M | `core/policy.js:59` |
| P1 | LEGAL-1 | Operational defaults are not legal verification; founder must approve market-specific outreach policy. | M | `config/fact_sheet.yaml:3` |
| P1 | JOBS-1 | Manual maintenance implemented; autonomous search, reply polling and unattended scheduler not enabled. | L | `core/crm.js:20` |
| P2 | REPORT-3 | Some measures/denominators remain basic; actual staffing throughput unverified. | M | `core/crm.js:64` |
| P1 | ROBUST-2 | No paid retry by design. No distributed limiter or background campaign resume yet. | M | `core/linkedin.js:4` |
| P1 | SEC-2 | Escaping, source allowlist and instructions reduce risk, do not prove all prompt injection impossible. | M | `public/workspace.js:1` |
| P2 | UX-4 | Responsive controls and labels; complete accessibility/device audit unverified. | M | `public/workspace.html:1` |
| P1 | MIGRATE-1 | Local database tested; production migration intentionally not run. | M | `scripts/migrate.mjs:2` |

Completed first: server-side access boundaries, approval/suppression rules and safe fixtures. Then scoring, pipeline, drafts, triage, UI and reports. New dependency @libsql/client follows the existing repository vendor (`db/index.ts`); it is required for durable shared storage and concurrent-write tests. No vendor account created and no production migration executed.
