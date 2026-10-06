# EduSmart — School Operating System

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


EduSmart adalah platform **School Operating System** multi-tenant untuk operasional sekolah: data siswa, akademik, presensi, penilaian, rapor, portal orang tua/siswa, PPDB/CRM, keuangan, komunikasi, dan fondasi integrasi eksternal.

Implementasi saat ini menggunakan **TanStack Start/TanStack Router + React 19 + TypeScript + Vite + Supabase**, bukan Next.js. Next.js pada PRD awal adalah rekomendasi arsitektur pada tahap perencanaan; repository aktual adalah referensi teknis yang berlaku.

## Status Produk Saat Ini

- **Stage 1 — MVP Inti:** secara substansial telah terimplementasi pada core EduSmart.
- **Stage 2 — Monetisasi & Retensi:** **OPEN**.
- **Batch 29 — Communication Delivery Worker Runtime & Reliability:** **PERMANENTLY CLOSED**.
- **Batch 30:** belum dimulai.
- **Development migration parity pada closure B29:** `107 local = 107 remote`.
- **Full regression terakhir pada closure B29:** `736 passed, 0 failed, 79 files`.
- External communication provider nyata: **belum terpasang**.
- WhatsApp actual send: **belum tersedia**.
- Virtual Account: **belum tersedia**.
- Midtrans Dynamic QRIS: **sandbox-oriented / production disabled** pada scope yang sudah ditutup.

## Stack Utama

| Area | Implementasi aktual |
|---|---|
| Web framework | TanStack Start + TanStack Router + Vite |
| UI | React 19, Tailwind CSS v4, Radix/shadcn-style components |
| Language | TypeScript |
| Data fetching | TanStack React Query |
| Forms/validation | React Hook Form, Zod |
| Backend/data | Supabase (PostgreSQL, Auth, RLS, RPC/server boundary) |
| Tooling | Bun |
| Reporting | pdf-lib, exceljs |
| Charts | recharts |
| Worker | Repo-native Bun communication worker |
| Deployment target | Web app + Supabase; deployment runbook tersedia di `docs/deployment/` |

## Struktur Domain Tingkat Tinggi

EduSmart menggunakan hierarki:

`Organization → School → Membership/Capability → Domain Data`

`organization_id` adalah batas isolasi tertinggi untuk tenant/yayasan. `school_id` digunakan untuk data operasional yang dimiliki sekolah. Hak akses tidak ditentukan hanya oleh label role; **capability + membership + RLS** adalah boundary utama.

Domain yang sudah hadir antara lain:

- Auth, invitation, tenant/school context, RBAC/capabilities.
- Academic setup, curriculum, classroom, schedule.
- SIS siswa/wali/staff dan import/export.
- Attendance siswa dan staff.
- Teaching assignment dan teaching journal.
- Assessment, gradebook, report card, progression, period closing.
- Parent Portal dan Student Portal.
- Notification dan parent permission request.
- PPDB/Admissions, funnel/follow-up, pre-application lead.
- Finance, billing, invoice, payment, online-payment foundation, QRIS sandbox.
- Communication Center, external-delivery queue, delivery operations, worker runtime.
- Pilot-readiness/support operations.

## Menjalankan Project

Dari checkout repository:

```bash
bun install --frozen-lockfile
bun run dev
```

Script penting:

```bash
bun run build
bun test
bun run lint
bun run format:check
bunx tsc --noEmit
bun run worker:communication
```

Jangan memasukkan secret, `.env.local`, token, cookie, `storageState`, atau service-role key ke Git. Konfigurasi environment mengikuti handover internal/deployment environment yang berlaku.

## Dokumentasi Dalam Paket Ini

| File | Fungsi |
|---|---|
| `README.md` | Entry point dan status produk |
| `PRD.md` | PRD terkini: visi, scope, roadmap, status implementasi |
| `ARCHITECTURE.md` | Arsitektur aplikasi dan boundary utama |
| `DATABASE.md` | Model data, tenancy, migration, domain database |
| `SECURITY.md` | Model keamanan, RLS, auth, capability, secret/PII |
| `FEATURES.md` | Matriks fitur: implemented / partial / planned |
| `TESTING.md` | Strategi QA, test commands, release gates |
| `CHANGELOG.md` | Milestone implementasi per batch |
| `KNOWN_ISSUES.md` | Gap produk dan technical debt yang masih relevan |
| `HANDOVER.md` | Handover untuk engineer/staff berikutnya |
| `FLOWCHART_SYSTEM.md` | Flow sistem dalam Mermaid |
| `FLOWCHART_ARCHITECTURE.md` | Flow arsitektur dalam Mermaid |

## Source of Truth

Gunakan urutan berikut ketika dokumentasi dan kode berbeda:

1. `origin/main`, migration aktif, RLS/RPC, dan source code aktual.
2. Hasil release-gate / post-merge verification terbaru.
3. Dokumen arsitektur dan runbook yang masih sesuai current main.
4. PRD untuk intent/roadmap.
5. Dokumen historis lama sebagai referensi, bukan kontrak runtime.

## Referensi Repository

Dokumen existing yang penting:

- `docs/architecture/01_PRODUCT_DOMAIN_MODEL.md`
- `docs/architecture/02_TENANT_ARCHITECTURE.md`
- `docs/architecture/03_DATABASE_ERD.md`
- `docs/architecture/04_RBAC_PERMISSION_MATRIX.md`
- `docs/architecture/05_AUTHENTICATION_ARCHITECTURE.md`
- `docs/architecture/06_ACADEMIC_STRUCTURE.md`
- `docs/deployment/COOLIFY_DEPLOYMENT.md`
- `docs/deployment/SUPABASE_BOOTSTRAP.md`
- `docs/ui/EDUSMART_UI_GUIDELINES.md`
- `docs/batch-29/B29_POST_MERGE_VERIFICATION_REPORT.md`

Dokumentasi ini adalah **living documentation**. Setelah batch baru ditutup, perbarui `FEATURES.md`, `CHANGELOG.md`, `KNOWN_ISSUES.md`, dan `HANDOVER.md`.
