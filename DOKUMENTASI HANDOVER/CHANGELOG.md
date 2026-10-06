# EduSmart Changelog — Major Delivery Milestones

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


Dokumen ini merangkum milestone besar yang diketahui dari release-batch history. Ini bukan pengganti `git log`; Git tetap sumber histori commit paling detail.

## 2026-10 — Stage 2 Execution & Reliability

### Batch 29 — Communication Delivery Worker Runtime & Reliability

**Status: PERMANENTLY CLOSED**

- Persistent repo-native Bun worker.
- Polling, heartbeat, stale detection.
- Bounded concurrency.
- School round-robin fairness.
- Claim fencing.
- Dispatch-start/ambiguous-outcome safety.
- Graceful shutdown.
- Crash/lease recovery.
- Fake adapter only; zero real provider calls/messages.
- Development migration parity closure: `107 = 107`.
- Full regression: `736 passed, 0 failed, 79 files`.
- Feature SHA: `c82a8c915ad3b8e7fa0929ee0cd8cf65811ca06a`.
- PR #24 merge SHA: `68891e90f7bcda0cd13513ca7cf71d778433f068`.
- Closure documentation commit: `76ea08e5a090f7e55aa685f35dd05565904b8487`.

### Batch 28 — School-Scoped Pre-Application Inquiry & Lead Management

**Status: PERMANENTLY CLOSED**

- Pre-application leads.
- Lifecycle NEW/CONTACTED/QUALIFIED/CONVERTED/CLOSED.
- Same-school duplicate advisory.
- Optional same-school assignment.
- Next action/notes.
- Idempotent conversion to B18 AdmissionApplication.
- Cross-school denial/oracle security gates.

### Batch 27 — Midtrans BI-SNAP Dynamic QRIS Sandbox Integration

**Status: PERMANENTLY CLOSED**

- Midtrans BI-SNAP Core API integration.
- Dynamic QRIS only.
- Sandbox boundary.
- Production fail-closed.
- B19/B24 accounting/reconciliation truth preserved.
- No VA.

### Batch 26 — Single-School Pilot Readiness & Support Operations Foundation

**Status: PERMANENTLY CLOSED**

- Pilot readiness/support surfaces.
- Operational fallback/readiness guidance.
- School-scoped readiness checks.

### Batch 25 — Communication Delivery Operations Foundation

**Status: PERMANENTLY CLOSED**

- Atomic claim with `FOR UPDATE SKIP LOCKED`.
- Claim token/lease.
- Max 3 attempts.
- 30s/60s retry.
- Append-only attempts.
- Manual retry/requeue.
- Contact/consent resolver.
- Development execution cycle.

## 2026-09/10 — Stage 2 Foundations

### Batch 24 — Online Payment & Reconciliation Foundation

**Status: PERMANENTLY CLOSED**

- Provider-neutral online payment intent.
- Reconciliation boundary.
- Finance-domain integrity preserved.

### Batch 23 — Admissions Follow-up & Funnel Foundation

**Status: PERMANENTLY CLOSED**

- Admissions follow-up/funnel foundation.

### Batch 22 — External Communication Delivery Foundation

**Status: PERMANENTLY CLOSED**

- Delivery jobs/recipients/attempts.
- Provider-neutral external delivery lifecycle.
- Durable queue foundation.

### Batch 21 — UI/UX Stabilization, Localization & Theme

**Status: PERMANENTLY CLOSED**

- ID/EN localization improvements.
- User-facing error cleanup.
- Formatting consistency.
- Responsive portal checks.
- Theme/UI stabilization.

### Batch 20 — Communication Center Core & Broadcast Foundation

**Status: PERMANENTLY CLOSED**

- School/class announcements.
- Recipient snapshots.
- In-app notification publication.
- Foundation for later external delivery.

### Batch 19 — Finance & Billing Core

**Status: PERMANENTLY CLOSED**

- Billing plans.
- Invoice/payment.
- Partial payment/outstanding.
- Void controls.
- Parent finance portal.
- School/tenant isolation.

### Batch 18 — PPDB Admissions Core

**Status: PERMANENTLY CLOSED**

- Admission cycle/public form.
- Applicant/guardian/consent.
- Staff review.
- Accept/reject/withdraw.
- Conversion to SIS with idempotency/security controls.

## 2026-08/09 — Academic & Portal Runtime

### Batch 17 — Academic Period Closing & Historical Integrity

- Readiness.
- Close/reopen.
- Historical lock.
- Controlled correction.
- Audit trail.
- Concurrency/tenant isolation.

### Batch 16 — Report Card Runtime

- Report-card operational runtime and related reporting.

### Batch 15 — Assessment Gradebook Runtime

- Assessment/gradebook lifecycle.

### Batch 14 — Student Progression

- Student promotion/progression workflow.

### Batch 13 — Teacher Daily Operations

- Teacher daily operational surfaces/journal workflow.

### Batch 12 — Notifications & Parent Permissions

- Notifications.
- Parent permission request lifecycle.

### Batch 11 — Attendance Completion

- Attendance workflow stabilization/completion.

### Batch 10 — SIS Import/Export

- Data migration/import/export flows.

### Batch 9 — Student Portal

- Student self-service academic views.

### Batch 8 — Reporting

- Operational reporting foundation.

### Batch 7 — Parent Portal

- Parent linked-child portal and academic/operational views.

## Early Foundation

### Batch 2 — Student Information System

- SIS core.
- Cross-year/grade integrity hotfix and release gate.

### Batch 1 — Academic Setup

- Academic setup foundations.

### Batch 0 — Core Auth & Context

- Authentication.
- Tenant/school context foundation.

## Current Roadmap State

```text
Stage 1: substantially delivered
Stage 2: OPEN
B29: permanently closed
B30: NOT STARTED
```

Major Stage 2 gaps after B29:

- first real external communication provider;
- actual WhatsApp execution/template/provider lifecycle;
- communication delivery receipt/webhook if selected;
- Virtual Account;
- broader payment production readiness/pilot evidence.

Stage 3+ tetap mengikuti PRD dan belum boleh dianggap delivered.
