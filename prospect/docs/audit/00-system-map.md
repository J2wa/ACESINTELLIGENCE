# System map

Scope: `prospect/` on `J2wa/ACESINTELLIGENCE`, base commit cd7ece3, branch `audit/plan-alignment`. The repository root is the existing Next.js Workhub app. Its source, environment template, database adapter and conventions were inspected; unrelated Workhub business logic was not rewritten. No AGENTS.md was found in this checkout. Prospect is a separate Vercel project using root directory `prospect`.

## Baseline
`public/index.html`, `public/app.js`, `public/style.css`: plain browser JavaScript dashboard; localStorage CRM, no seats. `api/research.js`: Node serverless function, Gemini generateContent with Google Search followed by JSON extraction. `tests/research.test.js`: five passing tests. No datastore, queue, scheduler or sending integration. Model-estimated score differed from the plan. Direct LinkedIn scraping was absent.

## Revised data flow
Research UI -> authenticated `api/research.js` -> Gemini search and evidence extraction -> deterministic lead normalization -> restricted shared CRM. Team UI (`public/workspace.html`) -> `api/workspace.js` -> hashed seat-token authentication -> pure `core/crm.js` command -> additive libSQL state store with compare-and-swap revision -> response and report. Lead progression: Candidate (pre-pipeline holding area) -> Target -> Verified -> Contacted -> Engaged -> Qualifying -> Booked -> Held. Each active stage has its required role owner. Evidence is required at each transition.

`core/policy.js`: exact score weights, claim patterns, stage prerequisites, BANT-lite, sequence cadence, reply rules, working-time deadline and contact guard. `core/crm.js`: append-only suppressions/events, action permissions, review approvals, manual-task scheduling, reporting. `core/store.js`: separate libSQL database adapter; one versioned JSON state record, optimistic concurrency. `core/auth.js`: per-seat SHA256 token hashes, no token persistence in browser. `core/orchestrator.js`: injectable daily 35A/15B pipeline tested with mocks, no live scheduler activated. `core/linkedin.js`: optional public LinkedIn Apify run adapter; no actor/credentials configured and no real call performed.

`api/demo.js` uses fixtures and has no persistence or external API calls. It is a sandbox for training, not a security boundary for real records. It only accepts fixture company names. `api/linkedin.js` is authenticated and live-disabled by default. `scripts/migrate.mjs` creates an additive table only after explicit migration authorization; it does not read or modify Workhub tables. No production migration was performed.

## Prompts and configuration
- `prompts/ai1-research.md`: public research, exact signal schema, unknown values, suppression, injection resistance; used by grounded research and extraction.
- `prompts/ai2-copy.md`: copy/triage/report contract; the current execution path uses deterministic functions in `core/policy.js` and `core/crm.js`, not a live second model call. This is explicitly a versioned specification, not a falsely claimed autonomous employee.
- `core/prompts.js`: loads both prompt files and founder fact sheet.
- `config/fact_sheet.yaml`: empty approved-claims list, JSON syntax valid as YAML; founder must supply approved statements.
- `.env.example`: separate prospect database credentials, hashed seat configuration, and optional LinkedIn provider credentials.
- `vercel.json`: static output, 120-second Node functions, packaged prompts/config/core, response headers. No cron is registered.

## Reproducible commands
From `prospect/`: `npm ci --ignore-scripts`; `npm test`; `npm run lint`; `npm run build`; `npm run test:dry-run`. Installation and baseline tests passed. `lint` is a repository-local syntax scan, not ESLint. Local libSQL integration uses an in-memory database. Do not run `npm run db:migrate` on production until the founder authorizes the database and migration. Deployment checks use a Vercel preview; production remains on the prior release pending the shared-CRM decision.
