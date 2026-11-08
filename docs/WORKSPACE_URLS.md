# Shareable Workhub URLs

Based on `a165fe99192f0709c560809883a31c85b7549cbe`.

## Routes and state

- `/overview`, `/tasks`, `/timesheets`, `/projects`, `/team`, `/payroll`, `/profit`, `/settings`.
- `/{project}`, `/{project}/{employee}`, `/{project}/{employee}/{taskId}`.
- Optional `?account={accountSlug}` resolves cross-account task IDs. Generated task links always include the account. Without it, multiple matches produce a chooser.
- A root-layout `WorkhubShell` owns the existing snapshot, polling, presence, dialogs and mutation handlers. Route changes use Next navigation without mounting another workspace. Detail data comes from that snapshot; audit history retains its existing authorized API request.
- Proxy authorization precedes React streaming, so unauthorized and missing pages both return HTTP 404 with identical generic HTML. The App Router page repeats authorization. Logged-out paths redirect to `/login?returnTo=...`; the client validates the return target before navigation.

## Persistent identity and migration

`0011_workspace_routes.sql` introduces additive URL tables, declared in `db/schema.ts`. Following the `project_links` pattern, the project's unique slug is stored in `project_urls` and exposed as `project.slug`; no business table or existing trigger is rebuilt. `project_slug_history` reserves current and old slugs in one namespace. Explicit slug edits are transactional with project updates; old paths redirect only after authorization.

Run **`pnpm db:migrate`**, which backfills names inside the 0011 migration transaction using `backfillRoutes`. The matching `ensureRoutingSchema` also initializes/backfills deployments using runtime schema initialization. Applying only the SQL file creates the tables; the ensure helper performs the name backfill on first access. Existing reserved names receive `-project` during backfill; new reserved slugs are rejected. Name collisions use `-2`, `-3`, etc.

Employee and account slugs are persisted on first use with eight ID characters and collision suffixes; renaming does not regenerate them. Emails are not used. Ordinary task IDs use encodeURIComponent and decode exactly once, preserving leading zeros, slashes, Unicode and literal percent sequences. Dot-only IDs (`.` and `..`) and IDs starting with `~` use a reversible `~` prefix to prevent browser dot-segment normalization.

Employees retain only their own user/task/time/payroll data. Account names for their historical tasks are also available for account disambiguation even if an account assignment was subsequently removed. Reading project routes still requires current project membership. No client prices or profit rows are added to employee snapshots or resolution results.

## Source/reference discrepancy

The Help dialog still describes tracker columns A–J. The implementation is A–P (16 columns), as the attached reference states. This change does not alter the tracker or its headers. The baseline commit otherwise matches the inspected routing/session/snapshot architecture.

## Verification

Executed locally against isolated temporary databases:

- `pnpm test`: 54 tests passed, including exact ID round trips, reserved slugs, ambiguity, return-path validation and the numbered migration run twice against existing projects.
- `pnpm test:routes`: 25 API checks passed, plus page-access checks for generic 404, authentication redirect, alias redirect, headers, stable identifiers, idempotent backfill and unchanged triggers.
- `pnpm test:integration`: 326 checks passed.
- `pnpm test:payroll`: 153 checks passed (intentional failure-injection logs are expected).
- `pnpm test:sheets`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed, including the Next proxy and catch-all page.
- `pnpm lint`: fails with 63 errors and 27 warnings. An untouched baseline worktree produces the same 63 errors and 27 warnings; existing errors are primarily explicit `any` types. Lint rules were not weakened.

Browser QA is unverified: the provided preview daemon invokes `next dev` with unsupported Vite flags (`--host`, `--strictPort`) and exits before serving. Thus browser Back/Forward, clipboard, modal interactions, polling continuity and rendered layout have not been exercised in a browser. The page-access tests invoke the same request handler used by the proxy, not a running Next HTTP server. No production migration or deployment was performed.
