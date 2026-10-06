# EduSmart Engineering Handover

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


## 1. Current State

Current known release state:

```text
B28: PERMANENTLY CLOSED
B29: PERMANENTLY CLOSED
Stage 2: OPEN
Batch 30: NOT STARTED
Development migrations: 107 = 107 at B29 closure
Full regression baseline: 736 passed / 0 failed / 79 files
```

B29 identifiers:

```text
Feature SHA:
c82a8c915ad3b8e7fa0929ee0cd8cf65811ca06a

PR:
#24

Merge SHA:
68891e90f7bcda0cd13513ca7cf71d778433f068

Post-merge closure documentation commit:
76ea08e5a090f7e55aa685f35dd05565904b8487
```

Selalu `git fetch origin` dan resolve current `origin/main` sebelum batch baru. Jangan hardcode SHA di atas sebagai current main selamanya.

## 2. Repository

Repository:

`gapaicoding/edusmart-core`

Current maintainer canonical checkout:

```text
D:\edusmart-core
```

Worktree policy yang dipakai saat ini:

```text
D:\edusmart-worktrees\edusmart-core-bXX
```

Gunakan main hanya untuk baseline/discovery/post-merge docs. Feature implementation dilakukan pada worktree/branch terpisah.

## 3. Stack

- TanStack Start / TanStack Router.
- React 19.
- TypeScript.
- Vite.
- Supabase PostgreSQL/Auth/RLS.
- TanStack React Query.
- Tailwind CSS v4.
- Zod.
- React Hook Form.
- Bun.
- pdf-lib / exceljs / recharts.
- Bun worker untuk communication delivery.

Jangan menyebut current app sebagai Next.js.

## 4. Source-of-Truth Rules

Jika dokumen saling berbeda:

1. current `origin/main`;
2. current migrations/RLS/RPC/source;
3. approved product decisions;
4. post-merge/implementation evidence;
5. architecture docs;
6. PRD roadmap.

Jangan mengubah runtime hanya supaya sesuai dokumen lama.

## 5. Standard Batch Workflow

```text
1. Scope discovery dari canonical main
2. Review gap aktual
3. Lock product decisions
4. Create D: worktree + feature branch
5. Implement
6. Apply Development-only migrations jika diperlukan
7. Validators + focused/full tests
8. TypeScript/lint/Prettier/build
9. Browser/security/live UAT
10. BLOCKER/HIGH harus 0
11. Commit + push feature branch
12. Manual PR + merge
13. Post-merge verification dari current origin/main
14. Closure report
15. Permanent close
```

Jangan mulai batch berikutnya sebelum batch sebelumnya permanently closed.

## 6. Git Rules

- No force push.
- No rebase/amend/squash history yang sudah pushed tanpa alasan/approval.
- Jangan `reset --hard` untuk mengatasi dirty canonical checkout.
- Jika canonical checkout dirty: inspect dan tentukan ownership file.
- Jangan stage `.env.local`, logs, PID, cookies, browser storage, secret, temp fixture.
- Feature branch push saja sebelum manual PR.
- Post-merge closure report masuk `main` setelah verification PASS.

## 7. Environment & Secrets

Secrets tidak boleh dicatat di handover.

Expected pattern:

- environment berada di local/deployment secret config;
- `.env.local` ignored;
- service-role hanya server/worker;
- provider secrets belum menjadi communication provider contract;
- QA password tidak didokumentasikan.

Jika staff baru tidak memiliki env, minta akses melalui secret-management/channel internal, bukan dari Git history.

## 8. Supabase

Current database approach:

- append-only migrations;
- RLS/FORCE RLS;
- validators;
- Development parity check;
- no Production mutation during normal QA.

Sebelum migration:

```text
inspect local migration list
inspect linked Development ledger
ensure parity
```

Sesudah migration:

```text
local = remote
validators PASS
anomaly checks PASS
```

## 9. Security Invariants

Jangan melanggar:

- organization/school isolation;
- capability-based auth;
- browser PermissionGate bukan authority;
- no direct service-role browser access;
- no raw role-name checks jika capability contract ada;
- no cross-school assignment;
- no foreign-school PII;
- no cross-school duplicate oracle;
- no secrets/log leakage;
- no direct production mutation dari QA.

## 10. Domain Ownership

### Admissions

B28 Lead → B18 AdmissionApplication → formal B18 conversion → SIS.

Jangan bypass B18 dengan direct Student/Enrollment creation dari lead.

### Finance

Internal accounting/reconciliation truth lebih authoritative daripada raw provider response.

### Communication

```text
B20 domain
→ B22 queue
→ B25 delivery operations
→ B29 worker runtime
→ future real provider
```

Jangan membuat queue kedua.

## 11. Communication Worker

Command:

```bash
bun run worker:communication
```

B29 runtime memiliki:

- config validation;
- heartbeat;
- RUNNING/DRAINING/STOPPED/STALE;
- bounded concurrency;
- round-robin school fairness;
- claim/lease/fencing;
- ambiguous outcome protection;
- graceful shutdown;
- Development fake adapter;
- Production fail-closed.

Real outbound provider belum ada.

## 12. Testing Baseline

Latest known B29 closure:

```text
Focused communication: 36/0
B29 runtime: 12/0
Full: 736/0, 79 files
TypeScript: PASS
Changed-scope lint: PASS
Prettier: PASS
Build: PASS
Database anomalies: 0
```

Jangan memaksa exact count jika current main menambahkan tests. Requirement utama adalah 0 failure dan tidak ada unexplained regression.

## 13. Current Product Gaps

Prioritas Stage 2 setelah B29:

1. first real external communication provider;
2. actual WhatsApp/provider template lifecycle;
3. provider receipt/webhook jika diperlukan;
4. Virtual Account/payment expansion;
5. production provider/pilot acceptance.

**B30 belum dimulai.** Scope harus melalui discovery dulu; jangan otomatis menganggap B30 = WhatsApp jika provider onboarding belum siap.

## 14. Recommended Next Action

Mulai dengan:

```text
B30 SCOPE DISCOVERY
```

Audit:

- provider readiness/account availability;
- communication adapter boundary setelah B29;
- WhatsApp template/consent requirements;
- callback/receipt requirement;
- closure dependency;
- alternatif seperti VA jika payment provider lebih siap.

Pilih batch yang dapat ditutup dengan evidence jelas dan tidak bergantung pada asumsi.

## 15. Important Documentation

Baca sebelum perubahan besar:

- root/project README dan docs.
- `docs/architecture/*`
- `docs/deployment/*`
- `docs/ui/*`
- batch reports B18–B29 yang relevan.
- current migration/validation scripts.
- original PRD sebagai roadmap.

## 16. Do Not Overclaim

Jangan menulis bahwa:

- Stage 2 selesai;
- WhatsApp live;
- Production worker/provider live;
- VA sudah ada;
- B27 berarti payment production-ready;
- AI/LMS/mobile/BI sudah implemented.

## 17. Handover Checklist

Sebelum engineer baru mulai:

- [ ] Repository access tersedia.
- [ ] `origin/main` berhasil fetch.
- [ ] Canonical checkout clean.
- [ ] Bun version/runtime tersedia.
- [ ] Development Supabase access tersedia.
- [ ] Local environment disediakan secara aman.
- [ ] Tidak ada secret di Git.
- [ ] Current migration parity diverifikasi.
- [ ] Full/focused baseline dipahami.
- [ ] Stage/batch status dipahami.
- [ ] Next batch dimulai dari discovery, bukan coding.
