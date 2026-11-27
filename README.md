# ACES Intelligence website

The public company website for ACES Intelligence, including its services, AI agent examples, project inquiries, careers information, and team sign-in.

| Site | Purpose |
| --- | --- |
| [acesintelligence.xyz](https://acesintelligence.xyz) | Company homepage, project inquiries, and careers information |
| [agents.acesintelligence.xyz](https://agents.acesintelligence.xyz) | AI agent examples and service inquiries |
| [login.acesintelligence.xyz](https://login.acesintelligence.xyz) | Google sign-in for approved ACES team members |

The [Careers portal](https://careers.acesintelligence.xyz) manages job listings, applicant accounts, and application history in [J2wa/j2work](https://github.com/J2wa/j2work). The [Workplace portal](https://workplace.acesintelligence.xyz) uses [J2wa/acesworkplace](https://github.com/J2wa/acesworkplace).

## Local development

Use Node.js 24. Install dependencies with `npm ci`. To review static pages locally, run `python3 -m http.server 8000 --directory public` and open `http://localhost:8000`. Use filenames such as `agents.html` directly when using the static server. Use Vercel's local development runtime for clean URLs, host redirects, and API routes. The form handler validates the request origin.

## Vercel deployment

The `aces-intelligence` project in the `aces-intelligence` Vercel team builds from the repository root. [vercel.json](vercel.json) serves `public/` and defines host redirects, security headers, and API rewrites. Keep server credentials in Vercel environment variables.

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN` | Send inquiries and careers form submissions through a verified Resend domain. Existing `connect_RESEND_*` names are supported. |
| `AUTH_SECRET` | Auth.js session signing secret |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth client for Team Login |
| `AUTH_ALLOWED_EMAILS` | Allowlist of team members for Google sign-in |

`api/submit.js` validates inquiries and career forms and sends them through Resend. Career form attachments are PDFs up to 3 MiB. `api/auth.js` handles Google OAuth and sends approved team members to Workplace.
