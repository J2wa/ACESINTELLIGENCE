# Requirements traceability

Evidence paths are relative to `prospect/`. Implemented means code and mock/local tests, not activated third-party services. User override replaces the document’s LinkedIn prohibition with a configurable public-data adapter.

| ID | Requirement | Baseline | After | Severity | Evidence | Limits |
|---|---|---|---|---|---|---|
| TRACK-1 | Two tracks, A priority and offers | Partial | Implemented | High | `core/policy.js:47` |  |
| DISC-1 | 40–50 daily, 70/30 mix, 200 verified weekly | Missing | Partial | High | `core/crm.js:23` | Daily plan 35A/15B; unattended discovery and achieved volume unverified. |
| DISC-2 | Source URL/date, unknown facts, unverified emails | Partial | Implemented | High | `core/crm.js:8` |  |
| DISC-3 | Cross-run and cross-track deduplication | Partial | Implemented | High | `core/crm.js:16` |  |
| DISC-4 | Contact enrichment and real email verification | Missing | Partial | High | `core/crm.js:32` | Manual evidence workflow only; no verifier account or enrichment API supplied. |
| LINK-1 | Public LinkedIn scraping (user override) | Missing | Partial | High | `core/linkedin.js:4` | Adapter mocked; compatible Actor/credentials/spend authorization not configured. |
| LINK-2 | No private-data/login bypass or automated messages | Implemented | Implemented | Blocker | `core/linkedin.js:3` |  |
| SCORE-1 | Exact A/B weights and 90-day recency | Broken | Implemented | High | `core/policy.js:5` |  |
| SCORE-2 | 60+ work, 80+ founder/custom message | Partial | Implemented | High | `core/crm.js:41` |  |
| SCORE-3 | Disqualifiers override score | Missing | Implemented | High | `core/policy.js:16` |  |
| BRIEF-1 | Exactly three personalization lines | Missing | Implemented | Medium | `core/policy.js:21` |  |
| CRM-1 | All required fields | Missing | Implemented | High | `core/crm.js:8` |  |
| CRM-2 | One restricted shared CRM | Missing | Partial | Blocker | `core/store.js:4` | Prepared, local integration tested; production datastore approval/configuration pending. Existing browser records retained. |
| CRM-3 | Seat access control | Missing | Partial | Blocker | `core/auth.js:3` | Enforced in code; no production seat tokens provisioned. |
| CRM-4 | Nothing deleted; append-only suppression and audit | Partial | Implemented | High | `core/crm.js:53` |  |
| CRM-5 | Concurrent writes and history preservation | Missing | Implemented | High | `core/store.js:7` |  |
| PIPE-1 | Target stage 60+ ICP | Missing | Implemented | High | `core/crm.js:8` | Candidates below 60 or disqualified remain outside Target; tested in policy tests. |
| PIPE-2 | Verified exact exit gate and one owner | Missing | Implemented | High | `core/policy.js:24` |  |
| PIPE-3 | Contacted exact exit gate and one owner | Missing | Implemented | High | `core/policy.js:24` |  |
| PIPE-4 | Engaged exact exit gate and one owner | Missing | Implemented | High | `core/policy.js:24` |  |
| PIPE-5 | Qualifying exact exit gate and one owner | Missing | Implemented | High | `core/policy.js:24` |  |
| PIPE-6 | Booked exact exit gate and one owner | Missing | Implemented | High | `core/policy.js:24` |  |
| PIPE-7 | Held exact exit gate and one owner | Missing | Implemented | High | `core/policy.js:24` |  |
| QUAL-1 | All four BANT-lite criteria; start <=90 days | Missing | Implemented | High | `core/policy.js:22` |  |
| SEQ-1 | Seven touches days 1/2/5/8/12/16/21 | Missing | Implemented | High | `core/policy.js:52` |  |
| SEQ-2 | Day16 warm-only, due-date checks, four follow-ups | Missing | Implemented | High | `core/crm.js:45` |  |
| SEQ-3 | Emails <100 words, trigger first line, accurate footer | Partial | Implemented | High | `core/crm.js:41` |  |
| SEQ-4 | Schedule reviewed human tasks | Missing | Implemented | Medium | `core/crm.js:42` |  |
| SEND-1 | AI never sends; approval record required | Partial | Implemented | Blocker | `core/crm.js:22` | No sending connector. Guard applies to recording a human action; cannot control activity outside app. |
| SEND-2 | 60-day individual review and >90% later batch rule | Missing | Implemented | High | `core/crm.js:41` |  |
| SUP-1 | Global suppression before drafting/approval/contact | Partial | Implemented | Blocker | `core/policy.js:20` |  |
| SUP-2 | Immediate unsubscribe cancellation/suppression | Missing | Implemented | Blocker | `core/crm.js:47` |  |
| REPLY-1 | Six labels; safe suggested replies | Missing | Partial | Medium | `core/policy.js:55` | Keyword baseline; nuanced intent requires human review. No mail inbox polling. |
| SLA-1 | Positive reply two working hours | Missing | Implemented | Medium | `core/policy.js:58` |  |
| SLA-2 | 60-day inactivity -> monthly nurture | Missing | Implemented | Medium | `core/crm.js:22` |  |
| FACT-1 | Approved fact sheet; forbidden-claim scanner | Missing | Partial | High | `core/policy.js:38` | Pattern scanner plus review is not a semantic guarantee against every paraphrase. |
| FACT-2 | Cost/security deferred to founder | Missing | Implemented | High | `core/policy.js:56` |  |
| PROMPT-1 | Versioned AI1 and AI2 prompts | Missing | Implemented | Medium | `core/prompts.js:2` |  |
| PROMPT-2 | 20 evaluations per prompt incl adversarial cases | Missing | Partial | High | `tests/prompts.test.js:2` | 20+20 mocked contract checks; live model quality not evaluated without authorized test key. |
| DELIV-1 | Separate domain, DNS attestation, 14-day warm-up | Missing | Partial | High | `core/policy.js:59` | Configured attestation gate; actual DNS/warmup not independently verified. |
| DELIV-2 | 20 rising to 40 daily per mailbox | Missing | Implemented | High | `core/policy.js:59` |  |
| DELIV-3 | Bounce<3%, complaint<0.1%, unsub<1% pause | Missing | Partial | High | `core/policy.js:59` | Guard blocks recorded contacts; actual inbox/bounce/complaint ingestion requires provider. |
| REGION-1 | Configurable markets, strict markets excluded | Missing | Implemented | High | `core/policy.js:6` |  |
| LEGAL-1 | Jurisdiction-specific compliance | Missing | Partial | High | `config/fact_sheet.yaml:3` | Operational defaults are not legal verification; founder must approve market-specific outreach policy. |
| JOBS-1 | Daily/weekly idempotent jobs, Manila/send windows | Missing | Partial | High | `core/crm.js:20` | Manual maintenance implemented; autonomous search, reply polling and unattended scheduler not enabled. |
| COVER-1 | Cover rule replies first and new-send pause | Missing | Implemented | Medium | `core/policy.js:59` |  |
| REPORT-1 | Funnel by track vs monthly targets | Missing | Implemented | Medium | `core/crm.js:64` |  |
| REPORT-2 | 3 best/worst messages and 3 tests | Missing | Implemented | Medium | `core/crm.js:64` | Only explicitly draft-linked replies count; up to three available messages per ranking and three proposed tests. |
| REPORT-3 | Seat scorecards | Missing | Partial | Medium | `core/crm.js:64` | Some measures/denominators remain basic; actual staffing throughput unverified. |
| REPORT-4 | Daily hot view, founder call brief | Missing | Implemented | Medium | `core/crm.js:57` |  |
| REPORT-5 | Wednesday sample and feedback | Missing | Implemented | Medium | `core/crm.js:64` | Quality sample and founder feedback stored; feedback is included in subsequent research context. |
| ROBUST-1 | Bounded requests, timeouts and API errors | Partial | Implemented | High | `api/research.js:22` |  |
| ROBUST-2 | Distributed rate limit and durable provider jobs | Missing | Partial | High | `core/linkedin.js:4` | No paid retry by design. No distributed limiter or background campaign resume yet. |
| SEC-1 | Secrets outside repo, keys in memory, no credential logs | Implemented | Implemented | Blocker | `core/auth.js:1` |  |
| SEC-2 | Untrusted content and XSS controls | Partial | Partial | High | `public/workspace.js:1` | Escaping, source allowlist and instructions reduce risk, do not prove all prompt injection impossible. |
| UX-1 | VA1 edit/review/approve and sources one click away | Missing | Implemented | Medium | `public/workspace.js:19` |  |
| UX-2 | VA2 replies-first and BANT capture | Missing | Implemented | Medium | `public/workspace.js:12` |  |
| UX-3 | Founder hot list and report | Missing | Implemented | Medium | `public/workspace.js:11` |  |
| UX-4 | Mobile/keyboard/onboarding | Partial | Partial | Medium | `public/workspace.html:1` | Responsive controls and labels; complete accessibility/device audit unverified. |
| TEST-1 | 10-lead end-to-end dry run, all reply labels | Missing | Implemented | High | `scripts/dry-run.mjs:4` |  |
| MIGRATE-1 | Safe additive schema migration | Missing | Partial | High | `scripts/migrate.mjs:2` | Local database tested; production migration intentionally not run. |
| OUTREACH-1 | No real outreach or live paid data calls during audit | Implemented | Implemented | Blocker | `scripts/dry-run.mjs:8` | Deployment/GitHub operations only; provider traffic mocked. |
