# ACES lead program audit — 2026-11-01

The audit branch implements a shared CRM foundation, deterministic scoring, seven-stage pipeline, role permissions, human approval, suppression, reply triage, reports and a public LinkedIn data-provider adapter. Production has not been replaced. This is a tested implementation with activation and verification gaps, not a claim that every Target Plan protocol is complete.

## Evidence and counts

The 62-row [matrix](01-functionality.md) records 45 implemented and 17 partial requirements. At baseline, 59 were not fully implemented: 5 Blocker, 38 High, 16 Medium. These are requirement counts, not independent bug counts.

`npm test`: 65 pass, zero fail. `npm run lint`: syntax checks pass for 23 modules (not a semantic linter). `node scripts/dry-run.mjs`: ten synthetic inputs, cross-track duplicate handling, verification, drafts, review, simulated contact recording, qualification, booking, held outcome, six reply labels and suppression. See [test output](test-output.txt), [dry run](dry-run-output.json), [prompt audit](03-prompts.md) and [preview checks](browser-verification.md).

No real prospects, paid scraping requests or outbound messages were used. The 40 prompt cases use mocked outputs and deterministic rules; live model quality remains unverified. Vercel reports the code preview READY; browser runtime verification is blocked by deployment authentication.

## Requested guarantees and limits

- Sending: no email or LinkedIn messaging connector exists. Recording manual outreach requires role, approval and policy checks. External human actions cannot be controlled by this app.
- Suppression: enforced on import flags, drafts, approval and manual-contact recording; unsubscribe cancels pending approvals/tasks. Tested in policy and fixture suites.
- Claims: unreviewed model outreach is discarded; templates and edits pass claim-pattern checks and human review. This does not prove every semantic paraphrase is safe. Approved claims are empty until supplied by founder.
- Retention: application actions archive rather than delete; suppression and audit entries are retained. Local concurrent-write tests preserve history. Database administrators can still change records outside the application.
- LinkedIn: the user explicitly replaced the attachment's blanket prohibition. A fixed-host Apify adapter accepts public company/profile URLs, with explicit paid-run confirmation and live-provider configuration gates. No cookies, login bypass or messaging. Actor compatibility and live data quality remain unverified.

## Assumptions

The existing repository's libSQL vendor is reused for a proposed separate CRM database. No production data was migrated. Existing browser records remain available. Manila work hours and the Target Plan markets are defaults, configurable by the founder. No ACES pricing, capacity, certification or customer claims were invented. Maintenance is manually triggered; the 35A/15B discovery orchestrator is tested using injected mock providers, not an active scheduled agent.

## Decisions and inputs

Before production activation, approve a separate libSQL/Turso CRM or supply the preferred existing CRM. Supply its credentials through Vercel environment variables, provision hashed seat tokens, and run the additive migration after backup/approval. No secrets belong in GitHub or chat.

Supply approved fact-sheet claims, pilot terms, industries, excluded regions, do-not-contact list, sender details and a separate sending domain. Choose an email verification provider and compatible public LinkedIn Actor; authorize any real-prospect or paid testing separately. The existing AI key alone does not provide scraping, verification, storage or email infrastructure.

The attachment's Escalation section explicitly requires waiting for decisions involving “changing the primary datastore or CRM vendor” or “spending money.” All preparation is reviewable before those choices.

## Operation

Follow [README](../../README.md) for environment variables, database setup, role onboarding and test commands. VA1 reviews source evidence and drafts; VA2 works replies and qualification; founder reviews hot prospects, fact claims and reports. Explore dry run uses synthetic data and does not persist production records. No automatic outreach is enabled.

## Top five next improvements

1. Configure the approved shared database, seat credentials, backup and recovery; verify deployed browser-to-database flow.
2. Select and test discovery, public LinkedIn and email-verification providers using authorized fixtures before real prospects.
3. Add durable scheduled orchestration, job checkpoints, distributed rate limits and recovery.
4. Replace JSON editing with guided fields; complete keyboard, mobile and accessibility checks.
5. Evaluate live AI1/AI2 quality and semantic claim review, then improve message attribution and cohort-based seat metrics.

Remaining work, priorities and dependencies are listed in [gap plan](04-gap-plan.md).
