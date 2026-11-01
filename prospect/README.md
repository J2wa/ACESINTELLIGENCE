# ACES Prospect AI
Gemini Google Search research, citation-constrained leads, review statuses, browser-local history, CSV export and outreach drafts. No messages are sent.

Vercel root: `prospect`. Framework: Other. Build: `npm run build`. Output: `public`. API: `api/research.js`. Node 22+. Production branch: `aces-prospect-ai`. Domain: leads.acesintelligence.xyz.

Open API settings, enter a Gemini key, test connection, select an available Google Search grounding-capable model. The key remains in tab memory and travels only to this app's server and Google; never logged or stored. API billing applies. No shared server key is used. Refresh clears credentials.

Leads/history persist ONLY in localStorage in this browser. Export regularly. This is not a shared CRM. No login, shared team storage, scheduled jobs, direct social scraping, Apollo enrichment or email verification. LinkedIn/Facebook discovery uses public search indexing. Source URLs and buying signals need human verification; citation allowlisting proves retrieval provenance, not truth.

Two bounded Gemini calls: grounded discovery, then JSON extraction. No search citations means no saved leads. Unsupported citation URLs discarded. Domain deduplication and do-not-contact exclusions. Max 15 candidates/run, 50s provider timeout per call, 120s function timeout. No automatic retries. Search costs depend on model-generated query count.

Checks: `npm test` and `npm run build`. Tests cover key checks, origin checks, citation filtering, deduplication, unsafe links and mocked provider flow. Live API behavior requires a real key. Connection test lists models but does not guarantee grounding quota.

API documentation: https://ai.google.dev/gemini-api/docs/generate-content/google-search
