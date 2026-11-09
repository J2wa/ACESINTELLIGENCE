# Content and configuration checklist

Every unique visible placeholder is listed below. Repeated footer placeholders appear once with all affected routes.

- [ ] [ADD: activate and verify hello@ and careers@acesintelligence.xyz before publishing these contact addresses]
  Routes: /, /agents, /careers, /domains/education-languages, /domains/engineering, /domains/finance, /domains/legal, /domains/medical, /domains/multimedia, /inquiry, /privacy, /security, /services/agentic-ai, /services/multimodal-data-annotation, /services/rlhf-model-evaluation, /team-login, /terms

- [ ] [ADD: actual evaluator screening, qualification verification, calibration and periodic review process]
  Routes: /security

- [ ] [ADD: actual processors, recipient categories, hosting countries, international-transfer safeguards and any client sharing]
  Routes: /privacy

- [ ] [ADD: actual screening, credential-verification and calibration process]
  Routes: /

- [ ] [ADD: agreement score, statistic, sample size and date]
  Routes: /

- [ ] [ADD: application and résumé retention period, talent-pool period if applicable, backup retention and deletion process]
  Routes: /privacy

- [ ] [ADD: approved RLHF sample deliverable and measured evaluation case study]
  Routes: /services/rlhf-model-evaluation

- [ ] [ADD: approved anonymized case study: client context, modality, challenge, scope, approach and measured outcome]
  Routes: /

- [ ] [ADD: approved application review timeframe and applicant contact process]
  Routes: /careers

- [ ] [ADD: approved client logos and permission to publish, or use anonymized client descriptions]
  Routes: /

- [ ] [ADD: approved governing law, venue and contact route consistent with the Philippine business registration]
  Routes: /terms

- [ ] [ADD: approved inquiry response-time promise in business days, business hours and timezone]
  Routes: /inquiry

- [ ] [ADD: approved leadership names, roles, short biographies, professional profiles and photos with permission]
  Routes: /

- [ ] [ADD: approved limitations of liability and dispute-resolution provisions]
  Routes: /terms

- [ ] [ADD: approved minimum project size and pilot eligibility]
  Routes: /

- [ ] [ADD: approved pilot inclusions, typical sample size, duration and pricing]
  Routes: /

- [ ] [ADD: approved pricing models, currency and minimum engagement]
  Routes: /

- [ ] [ADD: approved recruitment steps and current open roles or domains in demand, with dates]
  Routes: /careers

- [ ] [ADD: approved testimonial, exact quotation, name, role and publication permission]
  Routes: /

- [ ] [ADD: confirm Tagalog/Filipino and Taglish service coverage before using them as headline differentiators; list other supported languages]
  Routes: /

- [ ] [ADD: confirm any additional legal bases and separate talent-pool consent if retained for future roles]
  Routes: /privacy

- [ ] [ADD: confirm supported languages and locales: Tagalog/Filipino, Taglish, English and any other Philippine languages; include proficiency and task coverage]
  Routes: /domains/education-languages

- [ ] [ADD: confirm whether analytics is enabled, provider, log retention and international processing]
  Routes: /privacy

- [ ] [ADD: confirmed NDA process, who signs and when]
  Routes: /security

- [ ] [ADD: confirmed education-languages specialist qualifications, current capacity and approved case evidence]
  Routes: /domains/education-languages

- [ ] [ADD: confirmed engineering specialist qualifications, current capacity and approved case evidence]
  Routes: /domains/engineering

- [ ] [ADD: confirmed finance specialist qualifications, current capacity and approved case evidence]
  Routes: /domains/finance

- [ ] [ADD: confirmed legal specialist qualifications, current capacity and approved case evidence]
  Routes: /domains/legal

- [ ] [ADD: confirmed medical specialist qualifications, current capacity and approved case evidence]
  Routes: /domains/medical

- [ ] [ADD: confirmed multimedia specialist qualifications, current capacity and approved case evidence]
  Routes: /domains/multimedia

- [ ] [ADD: confirmed ownership and permitted use of site text, logos, images and other materials]
  Routes: /terms

- [ ] [ADD: confirmed pilot deliverables and an approved redacted sample]
  Routes: /

- [ ] [ADD: confirmed review-stage count and stage names]
  Routes: /

- [ ] [ADD: confirmed security practices and supporting documentation]
  Routes: /

- [ ] [ADD: inquiry retention period and deletion schedule]
  Routes: /privacy

- [ ] [ADD: legal personal information controller name and registered address]
  Routes: /privacy

- [ ] [ADD: measured turnaround, batch size, task and measurement period]
  Routes: /

- [ ] [ADD: monitored data-protection contact name and domain email]
  Routes: /privacy

- [ ] [ADD: privacy-request acknowledgement and handling timeframe]
  Routes: /privacy

- [ ] [ADD: registered legal business name, registration number and registered business address]
  Routes: /

- [ ] [ADD: registered legal entity, business address and monitored contact email]
  Routes: /terms

- [ ] [ADD: security contact, incident escalation process and contractual notification commitments]
  Routes: /security

- [ ] [ADD: supported annotation platforms, export formats and approved example output]
  Routes: /services/multimodal-data-annotation

- [ ] [ADD: verified PII minimization, redaction, approved tools, storage locations, encryption, transfer and deletion procedures]
  Routes: /security

- [ ] [ADD: verified accuracy %, sample size, task, measurement method and date]
  Routes: /

- [ ] [ADD: verified integrations, supported deployment options and agent workflow case study]
  Routes: /services/agentic-ai

- [ ] [ADD: verified least-privilege access, account provisioning, MFA, device controls, access review and offboarding practices]
  Routes: /security

- [ ] [ADD: verified tool and integration list]
  Routes: /

- [ ] [ADD: verified typical delivery ranges and conditions]
  Routes: /

## Settings to configure

- [ ] Connect the existing Vercel marketing project to this repository with root `marketing-site`; keep Workhub settings unchanged.
- [ ] Provision and test hello@ and careers@ with your chosen email provider; configure exact MX, SPF, DKIM and DMARC records.
- [ ] Provision private persistent form storage, restrict staff access, set retention and backups, and assign inbox review ownership.
- [ ] Set FORMS_REDIS_URL, FORMS_REDIS_TOKEN, RATE_LIMIT_SECRET, INQUIRY_RETENTION_DAYS and APPLICATION_RETENTION_DAYS; enable FORMS_ENABLED only after the notice is complete.
- [ ] Verify attachment limits and add a malware-scanning/quarantine process before staff retrieve PDFs.
- [ ] Choose whether to enable aggregate analytics; set ANALYTICS_ENABLED and rebuild, then verify counters and log retention.
- [ ] Complete current privacy/terms details and review them before treating the drafts as final.
- [ ] Run mobile/desktop Lighthouse and form accessibility on a configured preview and on production; confirm the 90+ target.
- [ ] Test mail delivery, no-JS POST, successful private storage, failed storage, retries, TTL expiry, redirects and service preselection before production.

- [ ] Configure AUTH_ALLOWED_EMAILS with the existing authorized team members if retaining the legacy login domain; no personal allowlist is published in source.
