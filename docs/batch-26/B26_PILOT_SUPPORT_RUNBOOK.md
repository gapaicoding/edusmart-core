# EduSmart Batch 26 — Pilot Support Runbook

## Pilot assumptions

- B26 provides a school-scoped read-only readiness summary; it performs no automatic correction.
- In-app announcements/notifications are the supported communication path. WhatsApp and external email providers are not configured.
- B19 manual payment is the approved payment fallback. QRIS, VA, and gateway settlement are not available through B26.
- A Development readiness result validates software behavior only. A real school pilot requires school owner confirmation, agreed scope, and operational preparation.

## Before launch

1. Name school owners for academic/SIS, teaching, admissions (if included), finance (if included), and support.
2. Confirm the pilot school's users and school-scoped capabilities through existing membership/access workflows.
3. Review the active academic year, terms needed by the chosen workflows, classrooms, active enrollments, and class placements.
4. Review teacher assignments for the activities the school agreed to pilot.
5. Review student and guardian links for the participating cohort; not every student requires a guardian link.
6. Agree whether PPDB is in scope and whether an admission cycle/follow-up workload is ready.
7. If finance is in scope, review fee/billing setup and agree on the existing manual payment recording/reconciliation process.
8. Agree on in-app announcement/notification use and who will monitor it.
9. Open **Pilot Readiness** as an authorized school operator, refresh, and review blockers/warnings/fallbacks. Link actions open current setup surfaces; B26 does not repair them.

## Ownership and data boundary

- The school owns the accuracy of student, guardian, enrollment, academic, and finance source records.
- EduSmart support may guide an authorized school operator to existing workflows. Support must not ask for passwords, export personal data unnecessarily, impersonate users, or perform direct database corrections as part of B26.
- Correct data only through the existing supported domain workflow and the school's approved process. Re-run readiness after an authorized correction.

## First day

- Confirm staff sign-in and correct school selection.
- Test the agreed teacher workflow and class assignment.
- Test Student and Parent login/link paths with the school's nominated accounts.
- Confirm attendance/schedule workflows included in pilot scope.
- Publish an in-app communication only through the existing Communication Center and approved school process.
- Record support contact and escalation owner outside the readiness screen.

## First week

- Review assessment/grade workflows only if included in the agreed pilot.
- Review report-card data before any school sharing.
- Review PPDB and follow-up queue only if admissions are in scope.
- Reconcile manual payments through B19 and the school's finance procedure.
- Refresh readiness and review any new warning/blocker; maintain an issue log using the categories below.

## Issue triage

| Category       | First checks                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ACCESS         | Confirm sign-in, active organization/school context, and assigned capability; do not infer access from job title.            |
| DATA_LINKAGE   | Use existing SIS/student/guardian workflows; compare only the authorized school's source records.                            |
| ACADEMIC_SETUP | Check current year, term, grade/classroom, and enrollment through existing Academic/SIS pages.                               |
| PORTAL         | Confirm the account and school relationship in existing Student/Parent workflows; never share credentials.                   |
| ADMISSIONS     | Review the active B18 cycle and B23 follow-up queue if PPDB is in scope.                                                     |
| FINANCE        | Review B19 fee/billing configuration and manual payment recording; do not promise online settlement.                         |
| COMMUNICATION  | Use B20 in-app announcements/notifications; B25's provider-neutral delivery foundation does not send externally.             |
| PLATFORM       | Capture timestamp, route, safe error code, school scope, and reproduction steps; do not attach raw personal data or secrets. |

## Approved fallbacks

- **Online payment unavailable:** use the supported B19 manual payment path and the school's agreed reconciliation process.
- **External email/WhatsApp unavailable:** use B20 in-app announcement/notification workflow.
- **PPDB not active:** omit admissions from pilot scope unless school owners require it; readiness shows this as a warning.

## Incident severity and escalation

- **S1 — Security/data boundary:** suspected cross-school access, PII exposure, or unauthorized finance/admissions visibility. Stop the affected workflow and escalate immediately to the platform security owner.
- **S2 — Pilot-critical workflow unavailable:** school-wide sign-in, academic setup, or an agreed core workflow cannot proceed. Escalate to the implementation/support owner and school operator.
- **S3 — Degraded/limited workflow:** partial configuration, portal linkage, or a manual fallback is needed. Record owner and next review.
- **S4 — Guidance/usability:** non-blocking question or presentation issue. Record for normal support review.

## Recovery and rollback

- Refresh readiness after approved setup changes; the report is recalculated from current data.
- If a workflow is unsafe, pause that workflow and continue only the agreed safe manual/in-app alternatives.
- B26 creates no records and has no data rollback operation. Deactivation/withdrawal of a pilot is coordinated with school owners using existing account/access procedures; do not bulk-delete or bulk-disable data from this feature.
- External provider activation, payment processing, automatic correction, account impersonation, and direct database repair are outside B26.
