# EduSmart Feature Inventory

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


Legenda:

- **Implemented** — tersedia dan sudah melewati release-gate batch terkait.
- **Partial** — fondasi/flow tersedia, tetapi outcome roadmap belum lengkap.
- **Planned** — tercantum pada PRD/roadmap tetapi belum menjadi implemented current feature.

## 1. Platform & Access

| Feature | Status | Catatan |
|---|---|---|
| Multi-organization / multi-school | Implemented | Organization + school context |
| Supabase Auth | Implemented | Login/recovery/invitation |
| RBAC/capabilities | Implemented | Capability-based access |
| RLS tenant isolation | Implemented | Authoritative DB boundary |
| Localization ID/EN | Implemented | B21+ |
| Light/Dark theme | Implemented | B21+ |
| Responsive web | Implemented | Release UAT per batch |
| Native mobile app | Planned | Roadmap Stage 6 |

## 2. SIS

| Feature | Status |
|---|---|
| Student data | Implemented |
| Guardian data/relationship | Implemented |
| Staff data | Implemented |
| Class/enrollment | Implemented |
| Student detail/history | Implemented |
| SIS import | Implemented |
| SIS export | Implemented |
| Cross-year integrity | Implemented |

## 3. Academic

| Feature | Status |
|---|---|
| Academic years/terms | Implemented |
| Grade levels | Implemented |
| Curriculum/subjects | Implemented |
| Classrooms | Implemented |
| Teaching assignments | Implemented |
| Timetable/schedule | Implemented |
| Student attendance | Implemented |
| Staff attendance | Implemented |
| Teacher daily operations | Implemented |
| Teaching journals | Implemented |
| Assessment runtime | Implemented |
| Gradebook | Implemented |
| Report cards | Implemented |
| Report-card PDF | Implemented |
| Student progression | Implemented |
| Academic period closing | Implemented |
| Historical locking/correction audit | Implemented |

## 4. Parent & Student Experience

| Feature | Status |
|---|---|
| Parent Portal | Implemented |
| Linked-child context | Implemented |
| Parent attendance view | Implemented |
| Parent schedule/scores/report cards | Implemented |
| Parent billing view | Implemented |
| Permission request | Implemented |
| Student Portal | Implemented |
| Student schedule/attendance/scores/report cards | Implemented |
| Native push app | Planned/Partial roadmap |

## 5. Notifications & Permissions

| Feature | Status |
|---|---|
| In-app notifications | Implemented |
| Parent permission request workflow | Implemented |
| Communication announcements | Implemented |
| External provider delivery | Partial |
| Real WhatsApp | Missing |
| Real email transport | Missing |
| Provider delivery receipt | Missing |

## 6. PPDB / Admissions / CRM

| Feature | Status | Catatan |
|---|---|---|
| Admission cycle | Implemented | B18 |
| Public PPDB form | Implemented | B18 |
| Applicant + guardian + consent | Implemented | B18 |
| Staff review | Implemented | B18 |
| Accept/reject/withdraw lifecycle | Implemented | B18 |
| Conversion to SIS | Implemented | B18-controlled |
| Follow-up/funnel | Implemented | B23 |
| School-scoped leads | Implemented | B28 |
| Lead lifecycle | Implemented | NEW/CONTACTED/QUALIFIED/CONVERTED/CLOSED |
| Duplicate advisory | Implemented | Same-school advisory |
| Optional lead assignee | Implemented | Active same-school staff |
| Next action/notes | Implemented | Operational/bounded |
| Rich marketing automation | Planned | Not current core |
| AI lead scoring | Planned | Out of current stages |

## 7. Finance & Payments

| Feature | Status | Catatan |
|---|---|---|
| Billing plans | Implemented |
| Invoices | Implemented |
| Payments | Implemented |
| Partial payment | Implemented |
| Outstanding balance | Implemented |
| Void controls | Implemented |
| Parent finance portal | Implemented |
| Provider-neutral online payment intent | Implemented |
| Reconciliation foundation | Implemented |
| Dynamic QRIS | Partial | Midtrans BI-SNAP sandbox scope |
| Virtual Account | Missing | Stage 2 gap |
| Production provider readiness | Partial | External dependency |

## 8. Communication Center

| Feature | Status | Catatan |
|---|---|---|
| Announcement authoring | Implemented | B20 |
| School/class targeting | Implemented | Immutable recipient snapshot |
| In-app publication | Implemented | Notification inbox |
| External delivery queue | Implemented | B22 |
| Delivery attempts/audit | Implemented | B22/B25 |
| Claim/lease | Implemented | B25 |
| Retry 30s/60s, max 3 | Implemented | B25 |
| Manual retry/requeue | Implemented | Capability-scoped |
| Contact consent/eligibility | Implemented | B25 |
| Persistent worker | Implemented | B29 |
| Heartbeat/stale detection | Implemented | B29 |
| Bounded concurrency | Implemented | B29 |
| School fairness | Implemented | B29 |
| Claim fencing | Implemented | B29 |
| Crash/lease recovery | Implemented | B29 |
| Ambiguous-outcome safety | Implemented | B29 |
| Real provider adapter | Missing | Likely future batch |
| WhatsApp template model | Missing | Provider-specific |
| Provider callback/receipt | Missing | Future provider lifecycle |

## 9. Reporting & Operations

| Feature | Status |
|---|---|
| Operational reporting | Implemented |
| PDF generation | Implemented |
| Excel generation/import/export | Implemented |
| Pilot readiness/support operations | Implemented |
| Executive BI/advanced analytics | Planned |
| Custom report builder | Planned/Not evidenced as complete |

## 10. AI / LMS / Future Modules

| Feature | Status |
|---|---|
| AI Assistant | Planned |
| AI RPP/module generator | Planned |
| AI question generator | Planned |
| AI risk/management insight | Planned |
| LMS material/task | Planned |
| CBT full LMS | Planned |
| Student portfolio | Planned |
| Inventory/Sarpras | Planned |
| Library | Planned |
| UKS | Planned |
| Tahfidz/religious module | Planned |
| Full HR/payroll | Planned |
| School website CMS | Planned |
| Dinas dashboard | Planned |
| Enterprise SSO | Planned |

## 11. Current Product Boundary

Yang **tidak boleh diklaim** pada baseline ini:

- EduSmart belum mengirim WhatsApp nyata.
- EduSmart belum memiliki production external communication provider.
- VA belum implemented.
- B27 tidak membuktikan production payment readiness.
- Stage 2 belum selesai.
- AI/LMS/BI/mobile dari PRD belum menjadi current delivered scope.
