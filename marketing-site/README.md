# Aces Intelligence marketing website

Source for `acesintelligence.xyz`, recovered from its existing Vercel deployment and improved independently of the Workhub app at the repository root.

## Development

Node 24. `npm ci`, `npm run build`, `npm test`, `npm run dev`.

Static HTML is in `public/`. Shared navigation lives in `templates/header.html` and `templates/footer.html`; `npm run build` applies it and generates SEO tags, FAQ JSON-LD from visible FAQs, the sitemap and analytics configuration. Run the build after editing content. Do not edit generated SEO blocks directly. The legacy auth route is retained, but its private email allowlist is intentionally excluded from source. Configure AUTH_ALLOWED_EMAILS as a comma-separated secret for existing authorized users before deploying that route. An empty allowlist denies sign-in. Credentials are not part of this repository.

## Vercel connection — exact target

Existing project: `aces-intelligence` (`prj_NBrjmWNDkRcVW0RfADBtO1IgLdTh`), team `team_Pw91ey6Xt5O9rH9emJhAGNu4`. Repository: `J2wa/ACESINTELLIGENCE`. Set **Root Directory `marketing-site`**, Framework **Other**, build **`npm run build`**, output **`public`**, Node **24.x**, install **`npm ci`**. Connect Git in this existing project's Settings → Git. Do not connect the marketing domain to the Workhub root build. Review the branch in a preview first. Merge/release only after the configuration and factual content checklist is complete. Existing connector cannot reconnect an unlinked project automatically.

## Form storage and privacy prerequisites

Create a dedicated private Upstash-compatible Redis database with persistence, suitable size/command limits for a 3 MB PDF encoded as base64, no public read endpoints and eviction disabled. A successful SET is the durable receipt boundary; there is no email-delivery dependency. Configure `FORMS_REDIS_URL`, `FORMS_REDIS_TOKEN` and a strong random `RATE_LIMIT_SECRET` as Vercel secrets. Use distinct preview/production storage.

Approve and configure integer `INQUIRY_RETENTION_DAYS` and `APPLICATION_RETENTION_DAYS` to match the completed privacy notice. Each record gets a TTL at creation. Backups and provider logs require their own retention settings. Do not enable forms until contacts, processors, storage countries and retention disclosures are accurate; set `FORMS_ENABLED=true` only then.

Records are `aces:submission:<UUID>`, with an `ACES-<UUID>` receipt, consent version, timestamp and structured fields. Résumés are private base64 PDFs in the same expiring record, never a public asset. Authorized staff can use the provider's authenticated console (`SCAN` the prefix, then `GET` a key) for review. Restrict console access, define an owner who checks incoming records, and configure a provider/ticketing notification if needed. No public admin inbox, applicant-data export endpoint or outbound notification is silently enabled. PDF signature checking is not malware scanning; configure malware scanning/quarantine before staff download attachments, or use a managed recruitment uploader instead.

Rate limits use an atomic Redis counter keyed by a temporary HMAC of the Vercel-supplied client IP: five form attempts per ten-minute fixed window. Shared-office networks share the quota. Origin checks and a hidden honeypot supplement this; they are not authentication or a complete anti-bot service. Set Vercel firewall/body-limit rules if traffic requires them. Failed storage does not return a success response. Same-ID retries compare payload hashes; native no-JS POSTs receive an HTML confirmation but do not offer cross-request idempotency unless a submission ID is supplied.

## Email setup

Choose your mailbox provider; create and test `hello@acesintelligence.xyz` and `careers@acesintelligence.xyz`. Publish the provider's exact MX, SPF and DKIM records and an appropriate DMARC policy. Existing DNS records must be inspected before changing them; do not invent values or overwrite existing mail routing. Website mailto links do not provision mailboxes. The forms use private storage and do not need SMTP or Resend to acknowledge receipt.

## Analytics

Set `ANALYTICS_ENABLED=true` in the desired Vercel environment and rebuild after completing the notice. The deferred client sends only allowlisted event/context pairs (`cta_click`, `form_start`, `form_submit`). The server stores daily aggregate counters under `aces:metrics:` with 90-day TTL. No cookies, persistent visitor IDs, field values or query strings. The client respects DNT/GPC. Security counters expire after ten minutes. Provider logs still need separate review. Client events are best-effort and not authoritative business records; confirmed submissions are in the form database.

## Release checks

Read `docs/AUDIT.md`, `docs/CONTENT_CHECKLIST.md` and `docs/VALIDATION.md`. The marketing GitHub workflow produces mobile/desktop Lighthouse and form accessibility reports and checks 90+ performance and no automated accessibility findings on the review build. Repeat against the deployed URL. Validate receipt, duplicate retry, storage TTL, authorized staff review, DNS mail delivery, redirects, analytics counts and non-JS POST in a configured preview before production.
