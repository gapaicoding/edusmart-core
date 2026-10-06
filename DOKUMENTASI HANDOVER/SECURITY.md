# EduSmart Security Model

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


## 1. Security Principles

EduSmart menggunakan prinsip:

- **deny by default**;
- tenant/school isolation;
- least privilege;
- capability-based authorization;
- RLS sebagai authoritative data boundary;
- server-only privileged credential;
- explicit public boundary;
- secret/PII minimization;
- auditability;
- idempotency/concurrency protection pada workflow kritikal.

## 2. Authentication

Authentication menggunakan Supabase Auth.

Flow yang tersedia mencakup:

- login email/password;
- invitation acceptance;
- forgot password;
- reset password;
- protected authenticated routes.

Tidak ada alasan untuk menyimpan password pada application database. Password/token/session tidak boleh masuk log, report, fixture commit, atau screenshot repository.

## 3. Authorization

Authorization harus mengecek:

1. user authenticated;
2. organization membership;
3. school membership jika school-scoped;
4. required capability;
5. resource tenant/school ownership;
6. lifecycle-specific rule.

Contoh capability yang sudah digunakan repository mencakup action granular seperti admission lead read/manage/convert dan notification/communication actions.

**PermissionGate/UI visibility bukan security boundary.**

## 4. Row Level Security

Supabase/PostgreSQL RLS adalah lapisan authoritative.

Untuk tenant-owned domain:

- RLS harus aktif;
- `FORCE RLS` digunakan pada contract kritikal;
- cross-school/cross-org relationship harus ditolak;
- browser tidak boleh mendapat grant yang membypass command boundary;
- `anon` harus mendapat akses minimum untuk public route yang memang diperlukan.

## 5. Service Role

`service_role`:

- bypass RLS;
- hanya boleh berada di trusted server/worker runtime;
- tidak boleh dikirim ke browser;
- tidak boleh ditulis ke client bundle;
- tidak boleh muncul di log;
- tidak boleh dimasukkan ke docs/report/test output.

B29 worker memakai trusted machine/server authority. Human operator dan worker identity adalah boundary berbeda.

## 6. Public Surfaces

Public surface harus explicit.

Contoh:

- `/auth`
- invitation/password recovery;
- PPDB public application route;
- health endpoint yang aman;
- provider callback yang memang dirancang public.

Public route tidak boleh menjadi oracle untuk data school/tenant lain.

## 7. Multi-Tenant Isolation

Setiap request domain harus mencegah:

- IDOR;
- foreign-school list leakage;
- direct foreign-resource fetch;
- duplicate/advisory oracle lintas sekolah;
- cross-school assignment;
- cross-org foreign key;
- unauthorized aggregate disclosure.

B28 dan B29 release gates secara eksplisit menguji isolation tersebut.

## 8. PII

Data siswa, guardian, contact, finance, dan admission adalah sensitif.

Aturan:

- gunakan synthetic fixture untuk QA;
- minimize projection;
- mask destination pada operations UI bila memungkinkan;
- jangan log raw phone/email/message;
- jangan menaruh real PII di test fixtures;
- health/metrics hanya aggregate/safe identifiers;
- consent/contact eligibility dievaluasi pada server.

PRD menempatkan privacy data anak/UU PDP sebagai requirement. Implementasi teknis membantu enforcement, namun kepatuhan hukum penuh juga memerlukan policy organisasi, retention, DPA, operational controls, dan legal review.

## 9. Admissions Security

Admissions menangani PII publik dan staff-internal.

Boundary penting:

- public application terbatas pada lifecycle yang diizinkan;
- staff review memerlukan capability;
- B28 lead hanya school-scoped;
- duplicate advisory tidak boleh menjadi cross-school contact oracle;
- conversion harus idempotent;
- lead tidak langsung membuat SIS identity tanpa formal B18 boundary.

## 10. Finance Security

Finance membutuhkan:

- school/tenant isolation;
- immutable/reconstructable audit;
- idempotent payment/reconciliation;
- no trust pada browser amount/status;
- callback validation/provider contract;
- separation antara provider response dan internal accounting truth.

Midtrans B27 berada pada sandbox scope; jangan memasukkan production credential ke repository.

## 11. Communication Security

Communication pipeline:

- user/operator membuat communication melalui capability-scoped path;
- immutable target/recipient snapshot;
- worker-only claim/finalize RPC;
- contact resolver hanya pada trusted server;
- raw destination tidak tersedia pada normal operator projection;
- retry bounded;
- claim token/lease/fencing mencegah stale ownership;
- ambiguous post-dispatch outcome tidak otomatis dikirim ulang.

B29 tidak memasang real provider, sehingga external network send harus tetap `0` pada Development test adapter.

## 12. Secret Management

Tidak boleh commit:

- `.env.local`;
- service-role key;
- provider secret;
- access token;
- refresh token;
- Authorization header;
- cookie;
- browser storage state;
- password QA;
- merchant credential;
- webhook signing secret.

Secret harus dikelola melalui deployment environment/secret manager yang disetujui.

## 13. Logging

Log aman boleh berisi:

- opaque worker/job/attempt ID;
- lifecycle status;
- safe failure code;
- duration;
- aggregate counts.

Log tidak boleh berisi:

- password/token;
- full message body;
- raw destination;
- payment credential;
- service-role key;
- unnecessary applicant/child PII.

## 14. Security Testing

Release gate menggunakan kombinasi:

- SQL validators;
- RLS/grant assertions;
- unit/integration tests;
- anonymous/persona denial;
- cross-school direct/list isolation;
- duplicate-oracle checks;
- service-role/browser boundary checks;
- worker concurrency/fencing;
- secret/PII scans;
- console/network smoke;
- Production-mutation accounting.

## 15. Vulnerability Handling

Jika ditemukan issue:

- **BLOCKER:** cross-tenant leak, credential leak, real unintended payment/message, database corruption, auth bypass.
- **HIGH:** material authorization/reliability boundary failure, unsafe duplicate side effect, production fail-open, required security UAT incomplete.
- MEDIUM/LOW mengikuti impact dan exploitability.

Batch tidak boleh READY FOR PR / permanently closed ketika BLOCKER atau HIGH masih terbuka.

## 16. Security Checklist untuk Pull Request

- [ ] Tidak ada secret/PII baru.
- [ ] RLS/grants ditinjau.
- [ ] Server function memverifikasi auth/context.
- [ ] Capability check, bukan raw role-name.
- [ ] Cross-school/cross-org test ada.
- [ ] Idempotency jika command replay-sensitive.
- [ ] Concurrency test jika state transition kritikal.
- [ ] Production mutation tidak dilakukan selama QA.
- [ ] Browser console/network tidak membocorkan internal data.
- [ ] Migration append-only dan validator PASS.
