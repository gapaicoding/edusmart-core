# EduSmart Architecture

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


## 1. Architectural Style

EduSmart saat ini adalah aplikasi web TypeScript dengan pendekatan **modular application + Supabase-backed domain boundaries**. Ia bukan microservice-heavy system. Domain dipisahkan di level module/server function/database contract, sementara PostgreSQL/Supabase menjadi shared transactional backbone.

Prinsip utama:

- multi-tenant first;
- database RLS authoritative;
- capability-based authorization;
- explicit domain lifecycle;
- server-only privileged operations;
- append-only migrations;
- idempotency/concurrency safety pada workflow kritikal;
- provider integration dipisahkan dari core accounting/communication domain.

## 2. Technology Stack

| Layer | Teknologi |
|---|---|
| Web runtime | TanStack Start |
| Routing | TanStack Router |
| UI | React 19 |
| Build/dev | Vite |
| Language | TypeScript |
| Data/query | TanStack React Query |
| Forms | React Hook Form |
| Validation | Zod |
| Styling | Tailwind CSS v4 |
| Component primitives | Radix/shadcn-style |
| Database/Auth | Supabase PostgreSQL + Supabase Auth |
| Reports | pdf-lib, exceljs |
| Charts | recharts |
| Runtime tooling | Bun |
| Communication worker | Bun process/service |

## 3. Logical Layers

### Client/UI layer

Berisi:

- authenticated routes;
- public auth/PPDB routes;
- reusable feature components;
- query/mutation hooks;
- localization/theme;
- portal surfaces.

UI tidak boleh menjadi security authority.

### Application/server layer

Berisi:

- authenticated server functions;
- domain command/query functions;
- Supabase server clients;
- validation;
- capability/context checking;
- worker runtime;
- external provider adapters.

### Database/domain layer

Berisi:

- PostgreSQL tables;
- foreign/composite keys;
- constraints;
- RLS/FORCE RLS;
- RPCs;
- immutable/append-only audit records;
- migration history.

### External integration layer

Saat ini:

- Midtrans BI-SNAP Dynamic QRIS sandbox integration untuk payment scope tertentu.
- Communication provider **belum dikonfigurasi**; B29 tetap menggunakan deterministic fake adapter.

## 4. Tenant Architecture

Hierarki dasar:

```text
Organization
└── School
    ├── Members / capabilities
    ├── Students / enrollments
    ├── Academic data
    ├── Admissions
    ├── Finance
    └── Communications
```

Aturan:

- `organization_id` mengikat domain ke organisasi/yayasan.
- `school_id` mengikat data operasional ke sekolah.
- relationship lintas entity divalidasi agar tidak terjadi referensi cross-school/cross-org.
- selected school context tidak otomatis memberi authority; server/DB tetap memvalidasi membership/capability.

## 5. Identity & Authorization

`auth.users` adalah identity source untuk login. Profile aplikasi dipisahkan dari tenant membership.

Authorization melibatkan:

1. authenticated user;
2. organization membership;
3. school membership;
4. assigned capabilities/permissions;
5. row-level tenant constraint.

Role hanya alat grouping permission; jangan menulis business logic seperti `if role === "admin"` jika capability contract tersedia.

## 6. Route Architecture

Authenticated feature areas pada repo mencakup:

- `/dashboard`
- `/academic/*`
- `/students/*`
- `/guardians/*`
- `/staff/*`
- `/teaching-assignments`
- `/schedule/*`
- `/attendance/*`
- `/assessments/*`
- `/report-cards/*`
- `/student-progression/*`
- `/staff-attendance`
- `/teaching-journals/*`
- `/notifications`
- permission-request routes
- `/portal/*`
- `/student/*`
- SIS import/export
- `/admissions/*`
- `/finance/*`
- `/communications/*`
- `/pilot-readiness`
- `/settings`

Public/supporting routes mencakup auth/password/invitation, public PPDB cycle, health, serta provider callback tertentu.

## 7. Auth Flow

Flow umum:

```text
User
→ /auth
→ Supabase Auth
→ authenticated app context
→ organization/school context
→ capability hydration
→ protected route/server function
→ RLS/RPC/domain constraints
```

Invitation menggunakan token yang aman/hashed pada storage contract; password tidak disimpan pada application tables.

## 8. SIS & Academic Architecture

Core domain membedakan:

- identity siswa/staff/guardian;
- enrollment/employment/relationship yang temporal;
- academic structure;
- operational schedule/attendance;
- assessment/reporting.

Ini mencegah perubahan tahun ajaran menghapus identitas historis dan memungkinkan historical integrity/period closing.

## 9. Admissions Architecture

Tiga layer utama:

1. **Pre-application lead** — inquiry/lead school-scoped.
2. **Admission Application** — formal PPDB application lifecycle.
3. **SIS conversion** — student/guardian/enrollment dibuat melalui approved admission boundary.

B28 lead tidak boleh langsung membuat Student/StudentEnrollment. Conversion lead bersifat idempotent ke satu B18 application yang canonical.

## 10. Finance Architecture

Finance memisahkan:

- billing/invoice/payment accounting truth;
- online payment intent/reconciliation;
- provider-specific integration.

Midtrans QRIS sandbox tidak menjadi accounting authority. Callback/provider event harus dinormalisasi ke lifecycle internal dan tidak boleh menciptakan duplicate accounting entries.

## 11. Communication Architecture

Evolusi communication:

```text
B20 Announcement / recipient snapshot
→ B22 Delivery job / recipient / attempt
→ B25 Claim / lease / retry / contact eligibility
→ B29 Persistent worker runtime
→ Future real provider adapter
→ Future provider receipt/webhook
```

B29 menyediakan:

- persistent polling;
- heartbeat;
- stale detection;
- bounded concurrency;
- school fairness;
- claim fencing;
- dispatch-start marker;
- graceful shutdown;
- crash/lease recovery;
- ambiguous outcome safety.

Worker memakai service/server authority, bukan browser authority.

## 12. Error & Reliability Model

Prinsip:

- user-facing error harus localized/safe;
- internal code/stack trace tidak diekspos;
- idempotency pada command yang rawan replay;
- optimistic/concurrency controls pada lifecycle sensitif;
- append-only attempt/audit pada delivery dan domain tertentu;
- terminal state tidak boleh di-reset diam-diam.

## 13. Deployment Boundary

Aplikasi web dan worker adalah runtime berbeda tetapi berada dalam repository yang sama.

- Web process menangani UI/server functions.
- Worker process menangani communication delivery queue.
- Supabase menyimpan transactional state.
- External provider integration harus explicit/configured.
- Production real communication dispatch belum diaktifkan pada baseline ini.

## 14. Architecture Decision Guidance

Sebelum menambahkan teknologi baru:

1. cek apakah Postgres/Supabase contract yang ada sudah menyelesaikan masalah;
2. reuse domain lifecycle;
3. jangan membuat queue/domain truth kedua;
4. hindari Redis/BullMQ/Kafka tanpa kebutuhan terukur;
5. jangan memasukkan provider logic ke core accounting/domain;
6. pertahankan fail-closed behavior untuk provider yang belum approved.

Lihat `FLOWCHART_ARCHITECTURE.md` untuk diagram Mermaid.
