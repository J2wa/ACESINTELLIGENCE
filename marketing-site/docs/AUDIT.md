# Audit — 10 November 2026 (Asia/Manila)

## Source and deployment

- `J2wa/ACESINTELLIGENCE` default `main`, baseline `37950f09c4440887eca571fe0baaf16c3e05c499`, is the Workhub Next.js application.
- Marketing production is Vercel project `aces-intelligence`, ID `prj_NBrjmWNDkRcVW0RfADBtO1IgLdTh`, team `team_Pw91ey6Xt5O9rH9emJhAGNu4`.
- Production deployment inspected: `dpl_8iJyEy8qRgX7Tzejw9kxnTUqSUg2`. It has no Git source metadata and exposes a CLI/API-uploaded source tree.
- Static pages and assets recovered from the live site; small server files recovered through Vercel. The old `lib/submissions.js` and lockfile responses were truncated. The old form backend therefore could not be fully audited or faithfully recovered. A new independently tested handler replaces it in the proposed source; no production mutation was made during the audit.
- New marketing source is isolated in `marketing-site/`. Workhub application files are unchanged. The shared repository root's TypeScript and ESLint globs still need checking before merge; do not deploy Workhub using marketing settings.

## Verified findings before changes

| Severity | Finding | Evidence |
|---|---|---|
| High | No Git source attached to marketing deployment | Vercel deployment response has empty metadata and no gitSource |
| High | Missing robots and sitemap | Live GET `/robots.txt` and `/sitemap.xml`: HTTP 404 |
| High | No canonical, OG/Twitter or JSON-LD on inspected pages | Live HTML for `/`, `/inquiry`, `/careers`, `/agents` |
| High | Personal-data forms without policy links | Both consent texts expose Gmail and have no Privacy/Terms links |
| High | Existing backend persistence and rate limiting unknown | Deployed backend retrieval truncated; no real submissions sent |
| Medium | Missing proof, team, security, pilot, FAQ and SEO landing pages | Homepage content and deployed source tree |
| Medium | Displayed email points to inquiry page, not mailto | Homepage link target |
| Medium | Login in primary nav and inconsistent name | `Workzone login` in header, `Team login` in footer |
| Medium | Duplicate agents host | `agents.acesintelligence.xyz` redirects to `/agents` on its own host |
| Medium | Careers phone required; expertise free text | Careers HTML |
| Medium | No response-time or review-time guidance | Both form pages |
| Medium | No skip link | Live source and browser accessibility tree |
| Medium | Render-blocking external fonts and animated blur | Fontshare CSS import and homepage CSS |
| Low | H1 raw text joins sentences without whitespace | `Human expertise.<span...>Better AI.`; browser AX nevertheless reads the heading with a space |

Already working: labels and native required fields; inline success/error container; off-screen honeypot with aria-hidden and tabindex=-1; `?service=ai-agent` confirmed selected in live browser; Escape/outside-click mobile-menu handling; reduced-motion CSS. Careers project interest was an unchecked checkbox, not pre-filled.

## Baseline Lighthouse limitation

Both mobile and desktop Lighthouse 13.6.0 commands were attempted. Chromium exited before gathering data because the executor disallows the process-singleton socket (`socket() failed: Operation not permitted`). No valid score exists. Do not report 90+ from these attempts. The PR workflow reruns live-site baselines and local review-build mobile/desktop audits, plus form accessibility audits, on a GitHub runner. Local review-build results do not prove live production network performance.

## Verification performed

- Browser review of live homepage and inquiry preselection; browser review of revised homepage and forms.
- Node tests cover metadata, one H1/main per page, local assets/links, consent/native POST, optional phone, sitemap, validation, false-success prevention, idempotency, storage failure, rate-limit rejection, PDF signature/size, configured retention, origin checks and analytics PII allowlist.
- Exact brand white-on-#1548ed contrast is calculated in `docs/VALIDATION.md`; automated browser accessibility audit remains pending the remote runner.
- RA 10173 draft checked against National Privacy Commission primary sources: https://privacy.gov.ph/data-privacy-act/ and https://privacy.gov.ph/the-right-to-be-informed/. It is a draft, not a compliance certification; actual controller, recipients, locations, retention and contacts require completion.
