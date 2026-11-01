# Usability audit

| Seat | Baseline friction | Severity | Change / remaining limit |
|---|---|---|---|
| VA1 | Free-form status changes; no review audit or sequence | High | Seven drafts, editable text, named-source links, individual approval, specific-need gate for 80+, scheduled human tasks. Large-list batch UX remains basic. |
| VA2 | No replies queue, BANT or booking evidence | High | Replies-first queue ordered by positive-reply SLA; BANT fields and calendar/handoff evidence in lead detail; founder brief action. BANT is JSON in this release, a nontechnical usability limitation. |
| Founder | No hot-lead view, scorecard or report | Medium | Hot list, Friday report, quality sample and saved feedback. Report is JSON, readable but not a polished executive dashboard. |
| Everyone | Data siloed per browser | Blocker | Restricted shared CRM prepared. Production needs authorized database and seat tokens; fixture mode is available for training. |
| Everyone | Inconsistent four-status pipeline | High | Seven named stages plus a pre-pipeline Candidate holding area. Single role owner set by transitions. |
| Everyone | No clear blocked-action reason | Medium | Server returns validation errors; UI shows them without silently advancing stages. |

Mobile: responsive form/table styles at 720px, labeled inputs, native buttons/dialog. Tables scroll horizontally. Full assistive-technology and device coverage remains unverified. No screenshot is treated as proof of API success. Browser verification results are recorded separately in `browser-verification.md`.

Onboarding: connect a founder-issued seat token or choose Explore dry run; begin in Replies first for VA2, Pipeline for VA1, Founder hot leads for founder. Open a lead, inspect its source, record verification evidence, then advance. Draft emails require personalization with the trigger before approval. The app never transmits outreach; record completed human actions only after doing them in the authorized external tool. Configure sender/region requirements before recording contact. No real prospects should be entered into the fixture sandbox.
