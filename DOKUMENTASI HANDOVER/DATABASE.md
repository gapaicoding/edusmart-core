# EduSmart Database Documentation

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


## 1. Database Platform

Database utama menggunakan **PostgreSQL melalui Supabase**. Supabase juga menyediakan authentication dan server-side RPC boundary yang digunakan oleh aplikasi.

Pada closure B29, Development migration ledger terverifikasi:

```text
107 local = 107 remote
```

Migration bersifat **append-only**. Migration lama tidak boleh diedit untuk memperbaiki feature baru yang sudah ter-deploy; gunakan migration baru.

## 2. Multi-Tenant Data Model

### Organization

`organizations` adalah boundary tenant/yayasan tingkat atas.

Domain organization-owned membawa `organization_id`.

### School

`schools` adalah unit operasional.

Data school-owned membawa `school_id` dan harus konsisten dengan `organization_id`.

### Membership

Representative membership/access tables:

- `organization_members`
- `school_members`
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`

Akses user berasal dari membership + capability, bukan sekadar field role pada record domain.

## 3. Identity Model

Representative entities:

- `auth.users` — authentication identity.
- `profiles` — application profile.
- `students` — student identity.
- `guardians` — guardian identity.
- staff identity/domain records.

Student/guardian/staff tidak selalu identik dengan Auth user. Hubungan login dan domain identity harus eksplisit.

## 4. Academic Model

Representative tables/domain objects dari arsitektur repository:

- `academic_years`
- `academic_terms`
- `grade_levels`
- `curricula`
- `subjects`
- `classrooms`
- `teaching_assignments`
- `timetable_entries`
- `attendance_sessions`
- `attendance_entries`
- `assessments`
- `assessment_scores`
- report-card period/document data.

Relationship akademik harus menjaga year/grade/class consistency. Historical data dilindungi oleh period-closing/historical-integrity contract.

## 5. SIS Relationships

Konsep penting:

- Student adalah identity jangka panjang.
- Enrollment adalah relationship temporal ke school/class/academic year.
- Guardian relationship eksplisit.
- Staff employment/membership tidak boleh disimpulkan hanya dari auth identity.

Import/export SIS harus mengikuti validator/domain constraint yang sama dengan CRUD normal.

## 6. Admissions / PPDB

Database admissions mencakup domain untuk:

- admission cycle;
- applicant/application;
- guardian/consent;
- review/status;
- funnel/follow-up;
- pre-application lead;
- lead activity/history;
- idempotent lead-to-application conversion.

B28 lead:

- tepat satu school scope;
- assignee opsional dan harus active same-school staff/member;
- duplicate advisory school-scoped;
- terminal `CONVERTED` / `CLOSED`;
- tidak langsung membuat Student/StudentEnrollment.

## 7. Finance

Domain database finance memisahkan:

- billing plan;
- invoice;
- payment;
- outstanding balance;
- provider-neutral online payment intent/reconciliation;
- provider-specific Midtrans QRIS records/events.

Accounting truth tetap berada pada internal finance lifecycle, bukan provider response mentah.

## 8. Communication Database

### B20 — Communication domain

- announcement;
- target;
- immutable recipient snapshot;
- canonical in-app notification fanout.

### B22 — Delivery foundation

Known authoritative tables:

- `communication_delivery_jobs`
- `communication_delivery_recipients`
- `communication_delivery_attempts`

### B25 — Delivery operations

Menambahkan contract untuk:

- `FOR UPDATE ... SKIP LOCKED` claim;
- claim token;
- lease expiry;
- retry schedule;
- append-only attempt events;
- manual retry/requeue;
- contact preference/consent resolution.

Retry baseline:

- max attempts: 3;
- automatic retry: 30s lalu 60s;
- permanent failure terminal.

### B29 — Worker runtime

Migration:

`20261006100000_b29_communication_delivery_worker_runtime.sql`

Menambahkan worker runtime/heartbeat contract dan dispatch-start safety sehingga:

- stale worker dapat dideteksi;
- stale ownership tidak boleh finalize;
- post-dispatch ambiguity menjadi unknown/non-auto-retry;
- health projection tidak memuat raw destination/message content.

## 9. RLS Model

Tenant-owned tables menggunakan RLS, dan domain kritikal menggunakan `FORCE ROW LEVEL SECURITY` sesuai contract batch.

Aturan umum:

- `anon` hanya boleh mengakses surface publik yang memang dirancang publik.
- `authenticated` tidak otomatis mendapat direct table mutation.
- ordinary CRUD melalui scoped server/RPC boundary.
- `service_role` hanya trusted server/worker internal dan tidak boleh sampai browser.

RLS tetap authority walaupun UI menyembunyikan action.

## 10. Constraints & Integrity

Jenis integrity yang penting:

- organization/school composite consistency;
- foreign keys;
- status enum/check constraints;
- same-school assignment;
- unique canonical conversion;
- idempotency key uniqueness;
- append-only audit/attempt rules;
- lease/fencing validation;
- terminal-state rules;
- historical-period lock.

Jangan mengandalkan validasi frontend untuk invariants tersebut.

## 11. Migration Policy

Setiap migration baru harus:

1. append-only;
2. idempotent terhadap deployment mechanism yang berlaku;
3. tidak mengedit migration yang sudah remote;
4. mempertahankan existing data;
5. menambahkan index/constraint secara aman;
6. menyertakan RLS/grant review;
7. memiliki validator SQL jika contract material;
8. diuji pada Development;
9. menghasilkan parity local = remote sebelum release.

Production migration hanya dilakukan melalui release process yang secara eksplisit mengizinkannya. QA Development tidak boleh menyentuh Production.

## 12. Supabase Types

Generated Supabase types tersedia di repository pada area integrasi Supabase, termasuk:

`src/integrations/supabase/types.ts`

Jika schema berubah, regenerate/update types sesuai workflow repository. Jangan menulis manual type yang bertentangan dengan generated schema tanpa alasan.

## 13. Query/Mutation Guidance

Untuk engineer baru:

- gunakan existing server functions/RPC;
- jangan direct browser table write jika domain sudah punya command;
- selalu bawa selected organization/school context secara aman;
- jangan percaya school ID dari browser tanpa membership/capability validation;
- gunakan existing idempotency contract;
- jangan membuat duplicated derived truth;
- gunakan transactions/locking ketika lifecycle membutuhkan concurrency safety.

## 14. Backup/Retention

PRD mengharapkan auditability, privacy, dan retention policy yang jelas, tetapi paket dokumentasi ini tidak menemukan bukti bahwa satu global retention/archival policy sudah selesai untuk seluruh domain.

Karena itu:

- jangan menghapus audit records secara ad-hoc;
- ikuti runbook domain;
- retention/purge baru harus dirancang per data class dan regulatory requirement;
- data anak/guardian harus diperlakukan sebagai PII sensitif.

## 15. Source of Truth

Untuk schema terkini:

1. `supabase/migrations/`
2. `supabase/validation/`
3. generated Supabase types
4. current server/domain code
5. architecture docs/PRD sebagai penjelas intent
