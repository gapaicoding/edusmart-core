# Product Requirements Document — EduSmart School Operating System

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


## 1. Ringkasan Produk

EduSmart adalah **School Operating System** berbasis cloud untuk mendigitalisasi siklus operasional sekolah dalam satu platform terpadu. Visi awal PRD adalah mengurangi fragmentasi aplikasi sekolah dengan menggabungkan SIS, akademik, portal, PPDB/CRM, finance, communication, LMS, AI, dan analytics secara bertahap.

Strategi delivery adalah **stage-by-stage**. Platform tidak dianggap selesai hanya karena satu modul hadir; setiap stage perlu release gate dan idealnya pilot dengan pengguna sekolah nyata.

## 2. Problem Statement

PRD awal mengidentifikasi masalah utama:

- data siswa, wali, guru, akademik, dan keuangan tersebar;
- banyak proses administrasi masih manual;
- informasi guru ↔ orang tua tidak konsisten;
- penagihan/pembayaran sulit ditelusuri;
- pimpinan sekolah/yayasan kurang memiliki visibilitas lintas fungsi;
- vendor yang tersedia sering hanya menyelesaikan satu bagian workflow;
- integrasi AI, analytics, dan automation masih terbatas.

## 3. Product Goals

1. Menjadi satu sumber data operasional sekolah yang terstruktur.
2. Mengurangi proses manual pada akademik, administrasi, PPDB, dan finance.
3. Memberi portal transparan untuk orang tua dan siswa.
4. Menjaga tenant/school isolation sebagai SaaS multi-tenant.
5. Membuat transaksi/approval/audit penting dapat ditelusuri.
6. Menjadi fondasi untuk communication provider, AI, LMS, analytics, dan mobile.
7. Menjaga implementasi bertahap agar setiap tahap dapat divalidasi sebelum ekspansi.

## 4. Persona

Persona dari PRD dan implementasi saat ini mencakup:

- Yayasan / Organization Owner.
- Kepala Sekolah / Principal.
- Wakasek / school leadership.
- Admin/Tata Usaha.
- Guru.
- Wali kelas.
- Staff admissions/PPDB.
- Finance/Bendahara.
- Orang tua / Guardian.
- Siswa.
- Staff operasional/support.

Persona lain dari roadmap — seperti BK khusus, HR/payroll penuh, dan Dinas Pendidikan — belum seluruhnya menjadi domain lengkap pada current implementation.

## 5. Prinsip Produk

### 5.1 Multi-tenant by design

- `Organization` adalah boundary yayasan/billing/security tingkat atas.
- `School` adalah tenant operasional.
- Membership dan capability menentukan apa yang dapat dilakukan user.
- RLS pada PostgreSQL/Supabase adalah boundary keamanan authoritative.

### 5.2 Domain ownership

Setiap lifecycle memiliki owner yang jelas. Contoh:

- B18 Admissions memiliki formal application lifecycle.
- B28 lead hanya mengonversi ke B18 application; tidak membuat Student/Enrollment secara langsung.
- B19/B24 memegang accounting/payment foundation.
- B22/B25/B29 memegang external-delivery orchestration; provider nyata tetap terpisah.

### 5.3 Fail closed

Fitur yang membutuhkan provider/secrets tidak boleh diam-diam bekerja dengan konfigurasi tidak lengkap. B29 communication worker, misalnya, tetap menggunakan fake adapter untuk Development dan tidak mengklaim real outbound delivery.

## 6. Scope Saat Ini

### 6.1 Stage 1 — MVP Inti

Status: **secara substansial terimplementasi**.

Scope yang sudah tersedia:

- Auth, invitation, multi-tenant context, role/capability.
- SIS siswa, guardian, staff, class/enrollment.
- Academic year/term/curriculum/subject/classroom.
- Teaching assignments dan schedule.
- Attendance.
- Assessment dan gradebook.
- Report card.
- Academic period closing/historical integrity.
- Parent Portal.
- Student Portal.
- Notifications dan permission request.
- SIS import/export.
- Reporting.

### 6.2 Stage 2 — Monetisasi & Retensi

Status: **OPEN**.

| Area | Status aktual | Catatan |
|---|---|---|
| PPDB / Admissions Core | Implemented | Intake, review, conversion, audit |
| Admissions follow-up/funnel | Implemented | Follow-up/funnel foundation |
| Pre-application lead CRM | Implemented | School-scoped lead management, duplicate advisory, conversion to B18 |
| Finance & Billing | Implemented core | Billing/invoice/payment/manual workflows |
| Online payment foundation | Implemented | Provider-neutral intent/reconciliation |
| Midtrans Dynamic QRIS | Partial/external-dependent | Sandbox scope; Production disabled |
| Virtual Account | Missing | Belum menjadi implemented payment method |
| Communication Center | Partial | In-app + queue/orchestration/worker ada |
| External communication worker | Implemented | Worker runtime/reliability sudah ditutup pada B29 |
| Real WhatsApp/email provider | Missing | Belum ada actual external send |
| Provider webhook/receipt | Missing | Belum ada delivery receipt ingress |
| Broadcast WhatsApp outcome | Partial | Audience/queue/worker ada; actual provider send belum ada |

Stage 2 belum boleh dinyatakan selesai sampai outcome bisnis yang masih bergantung provider diputuskan dan diverifikasi.

## 7. Functional Requirements per Domain

### 7.1 Identity, Tenant & Access

- Supabase authentication.
- Invite-based onboarding; tidak mengandalkan open self-signup sebagai flow utama.
- Selected organization/school context.
- Organization and school membership.
- Capability-based authorization.
- Tenant/school isolation via RLS and server-side checks.
- User-facing PermissionGate hanya UX, bukan security authority.

### 7.2 SIS

- Student, guardian, staff identity records.
- Student/guardian relationships.
- Class/enrollment history.
- Data detail pages.
- Import/export.
- Integrity antar academic year/grade/class.

### 7.3 Academic

- Academic year dan term.
- Grade levels, curricula, subjects, classrooms.
- Teaching assignments.
- Timetable/schedule.
- Student/staff attendance.
- Teacher daily operations dan teaching journal.
- Assessment/score entry.
- Report cards dan PDF.
- Student progression.
- Period closing, historical lock, controlled correction, audit.

### 7.4 Portals

Parent Portal:

- linked child context;
- attendance;
- schedule;
- scores/report cards;
- billing;
- permission requests.

Student Portal:

- own attendance;
- schedule;
- scores;
- report cards.

### 7.5 Admissions / PPDB / CRM

- Admission cycles.
- Public PPDB application.
- Applicant and guardian data.
- Consent.
- Staff review and lifecycle decisions.
- Conversion to formal SIS domain through approved lifecycle.
- Follow-up and funnel.
- School-scoped pre-application leads.
- Lead lifecycle `NEW → CONTACTED → QUALIFIED → CONVERTED` serta terminal `CLOSED`.
- Duplicate advisory bersifat school-scoped, bukan cross-school oracle.
- Optional same-school staff assignment.
- Next action dan bounded operational notes.

### 7.6 Finance

- Billing plan/invoice/payment.
- Outstanding balances dan partial payment.
- Void workflow dengan auditability.
- Parent finance portal.
- Provider-neutral online payment/reconciliation.
- Dynamic QRIS sandbox integration.
- VA belum tersedia.

### 7.7 Communication

- In-app announcement/notification.
- School/class audience.
- Immutable audience/recipient snapshot.
- External delivery queue.
- Recipient delivery lifecycle.
- Claim/lease/retry/audit.
- Bounded manual retry/requeue.
- Consent/contact resolution.
- Persistent Bun worker.
- Heartbeat/stale detection.
- Bounded concurrency dan school fairness.
- Crash/lease recovery.
- Ambiguous-outcome protection.
- **Tidak ada real communication provider pada baseline ini.**

## 8. Non-Functional Requirements

### Security

- RLS authoritative untuk tenant-owned data.
- Strict school/organization isolation.
- Capability-based authorization.
- Service-role hanya pada trusted server/worker boundary.
- No secrets in browser/log/report.
- PII diminimalkan pada projection/operational telemetry.
- Audit untuk lifecycle kritikal.

### Reliability

- Idempotency pada command sensitif.
- Concurrency controls untuk conversion/payment/delivery.
- Append-only history pada area yang memerlukan audit.
- Worker lease/fencing untuk external-delivery runtime.
- Graceful shutdown, heartbeat, stale detection, recovery.

### Localization & UX

- Bahasa Indonesia dan English.
- Light/Dark.
- Responsive web.
- Error message user-facing tidak mengekspos internal code.

### Maintainability

- Append-only migration.
- Test per domain.
- Validator SQL untuk contract yang kritikal.
- Documentation/report per release batch.
- `origin/main` sebagai source of truth setelah merge.

## 9. Arsitektur Teknis Aktual vs PRD Awal

PRD v1.0 merekomendasikan Next.js/Prisma/Auth.js sebagai opsi awal. Implementasi aktual berkembang menjadi:

- TanStack Start / TanStack Router.
- React 19 + Vite.
- Supabase Auth/PostgreSQL/RLS.
- TanStack React Query.
- Bun.
- Server functions/RPC boundary.

Karena itu, bagian tech stack PRD awal harus dibaca sebagai **planning recommendation**, bukan current runtime contract.

## 10. Roadmap

### Stage 0 — Foundation & Setup

Status: delivered sebagai fondasi platform.

### Stage 1 — MVP Inti

Status: secara substansial delivered.

### Stage 2 — Monetisasi & Retensi

Status: **OPEN**.

Remaining material gaps terutama:

1. real external communication provider;
2. actual WhatsApp delivery/template/provider policy;
3. communication provider callback/receipt jika dipilih;
4. Virtual Account/payment breadth dan provider-production readiness;
5. pilot/acceptance outcome sesuai keputusan produk.

### Stage 3 — Diferensiasi AI

Planned:

- AI assistant untuk guru;
- generator modul/RPP;
- generator soal;
- management summary;
- cost/rate limiting;
- guardrail/review.

### Stage 4 — LMS & Portofolio

Planned:

- materi;
- tugas;
- CBT sederhana;
- portofolio siswa.

### Stage 5 — Analytics & BI

Planned:

- executive dashboard;
- retention/growth/cashflow/KPI;
- multi-school yayasan view.

### Stage 6 — Mobile Native

Planned:

- React Native/Expo atau keputusan mobile terbaru;
- native notification;
- mobile/offline workflow.

### Stage 7+ — Modul Pelengkap / Enterprise

Roadmap-only:

- sarpras;
- perpustakaan;
- UKS;
- tahfidz/agama;
- HR/payroll lanjutan;
- surat/arsip;
- CMS sekolah;
- dashboard lintas sekolah/dinas;
- enterprise isolation/SSO.

## 11. Release Policy

Sebuah batch baru dianggap **permanently closed** setelah:

1. implementation selesai;
2. migration/validator/test/build PASS;
3. security and browser/operations UAT selesai;
4. BLOCKER = 0;
5. HIGH = 0;
6. feature branch merged;
7. post-merge verification dari current `origin/main` PASS;
8. closure report masuk ke main.

## 12. Success Metrics

PRD awal mengusulkan metrik:

- weekly teacher adoption;
- parent portal engagement;
- collection/payment timeliness;
- enrollment funnel conversion;
- school retention;
- operational time saved;
- usage/adoption untuk future AI modules.

Implementasi metric/analytics produk penuh masih menjadi roadmap; jangan menyamakan test metrics dengan business success metrics.

## 13. Out of Scope Baseline Saat Ini

Belum boleh dianggap implemented hanya karena tercantum di PRD:

- full LMS;
- production AI Assistant;
- mobile native app;
- advanced BI;
- Dinas dashboard;
- full payroll/HR suite;
- real WhatsApp provider;
- WhatsApp delivery receipt;
- Virtual Account;
- production-ready external provider lifecycle.

## 14. Referensi

- PRD EduSmart v1.0, 10 Agustus 2026.
- `docs/architecture/*`.
- `docs/batch-*/*`.
- Supabase migrations dan validators.
- Source modules/routes pada current `origin/main`.
