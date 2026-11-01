# Prompt audit and evaluation

Baseline had two inline instructions in `api/research.js`: a general research role and JSON extraction with incorrect score weights, model-generated outreach and no complete seat workflow. No versioned copy/triage/report prompt existed.

| Prompt | Revision | Validation | Limit |
|---|---|---|---|
| AI1 research | Versioned two-track role, evidence and date rules, exact signals, disqualifiers, unknown/unverified defaults, suppression, public LinkedIn provider override, never-send and untrusted-content rules | 20 mocked output-contract cases in tests/prompts.test.js; exact score, recency, suppression and API tests separately | No live Gemini prompt-quality test without an authorized test key. Mock labels do not imply a real model complied. |
| AI2 copy/triage/report | Versioned allowed facts, banned claims, 7-touch cadence, six labels, safe price/security answer, review and report contract | 20 mocked rule/contract cases; sequence/approval/triage tests | Execution currently uses deterministic templates/rules; prompt text itself is not invoked by a live AI2 agent. |

Cases include instruction override, key disclosure, pricing, turnaround, capacity, accuracy, certification/customer claims, missing email/source/date, future trigger, verification spoofing, unsubscribe, wrong person, cost/security questions, nurture and duplicates. Assertions test specific output controls; they are not 40 independent live-model evaluations. All 40 pass in the recorded suite. Missing/future-date behavior also has dedicated policy tests.

Claim safety: model-generated outreach is discarded during research. Deterministic sequence drafts require VA edits and approval. Pattern-based claim checks block common prohibited claims but cannot prove every possible semantic paraphrase safe. Founder-approved literal claims come only from the tracked fact sheet. Human review remains mandatory.

Changelog (2026-11-01): extracted AI1 role from inline research code; corrected score ownership to deterministic engine; added AI2 specification and safe templates; changed LinkedIn blanket ban to configurable public-business scraping adapter; removed unreviewed model outreach; added 20 mock cases per prompt.
