# EduSmart Testing & Release-Gate Guide

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


## 1. Testing Philosophy

EduSmart tidak menggunakan hanya satu jenis test. Release gate menggabungkan:

1. automated unit/integration tests;
2. SQL/database validators;
3. TypeScript compile;
4. lint/format/diff checks;
5. production build;
6. live Development database verification;
7. browser UAT;
8. security/persona/tenant isolation tests;
9. post-merge verification dari current `origin/main`.

Sebuah batch belum dianggap closed hanya karena unit test PASS.

## 2. Current Verified Baseline

Pada permanent closure B29:

```text
Development migrations: 107 = 107
Focused communication tests: 36 passed / 0 failed
B29 runtime subset: 12 passed / 0 failed
Full suite: 736 passed / 0 failed / 79 files
TypeScript: PASS
Changed-scope ESLint: PASS
Prettier: PASS
Production build: PASS
Database anomalies: 0
BLOCKER: 0
HIGH: 0
```

Angka ini adalah snapshot baseline, bukan target permanen. Jika test bertambah, gunakan current-main count.

## 3. Standard Commands

```bash
bun test
bunx tsc --noEmit
bun run lint
bun run format:check
bun run build
```

Worker:

```bash
bun run worker:communication
```

Supabase validation/deployment mengikuti script dan runbook repository.

## 4. Test Layers

### Unit tests

Digunakan untuk:

- pure business rules;
- parser/formatter;
- state transitions;
- retry calculations;
- adapter contract;
- config validation.

### Integration/domain tests

Digunakan untuk:

- server functions;
- cross-module lifecycle;
- idempotency;
- authorization boundary;
- payment/admission/communication commands.

### Database validators

`supabase/validation/` berisi validator contract per batch/domain.

Validator memeriksa antara lain:

- schema/constraint;
- RLS/FORCE RLS;
- grants;
- function/RPC contract;
- migration assumptions;
- tenant invariants.

### Browser UAT

Browser UAT digunakan untuk:

- route access;
- happy path;
- denial path;
- localization/theme;
- responsive;
- keyboard/focus practical check;
- console/network;
- payload leakage;
- actual authenticated context.

## 5. Security Test Matrix

Minimum untuk feature school-scoped:

- authorized same-school user;
- unauthorized persona;
- anonymous;
- foreign-school list isolation;
- foreign-school direct access;
- cross-school oracle check jika search/duplicate/advisory;
- service-role/browser privilege boundary;
- secret/PII scan.

## 6. Concurrency & Idempotency

Workflow sensitif harus diuji lebih dari happy path.

Contoh:

- admissions conversion hanya sekali;
- payment reconciliation tidak duplicate;
- period closing/reopen concurrency;
- communication two-worker claim;
- stale claim fencing;
- retry/requeue replay;
- crash-before/after side effect.

## 7. B29 Worker Reliability Testing

B29 ditutup setelah membuktikan:

- live eligible delivery;
- accepted/retryable/permanent/safe-skip;
- retry 30s/60s;
- pre-send timeout;
- ambiguous post-dispatch outcome;
- auto-resend ambiguous = 0;
- two-worker contention;
- duplicate claim/attempt-start = 0;
- claim fencing;
- crash-before/after dispatch;
- expired lease recovery;
- school fairness;
- heartbeat/stale detection;
- `Ctrl+C → DRAINING → STOPPED`;
- browser worker RPC denied;
- provider calls/real messages = 0.

## 8. Fixture Rules

QA fixtures harus:

- jelas synthetic;
- Development-only;
- tidak memakai real PII;
- dibuat melalui normal product/domain flow bila test ingin membuktikan lifecycle;
- tidak langsung memalsukan derived queue/attempt row;
- tidak mengubah role/capability hanya untuk membuat test lewat.

Jangan commit password synthetic QA ke docs/source.

## 9. Browser Console & Network

Untuk positive capture:

- page errors = 0;
- console errors = 0;
- unexpected warnings = 0;
- failed product request = 0;
- unexpected 401/403/500 = 0;
- unexpected provider request = 0.

Expected 401/403 untuk adversarial denial test dicatat terpisah, bukan dianggap product failure bila memang sesuai contract.

## 10. Migration Verification

Sebelum release:

1. list local migrations;
2. compare Development remote ledger;
3. missing local = 0;
4. missing remote = 0;
5. unexpected remote = 0;
6. duplicate timestamp = 0;
7. relevant validators PASS.

Jangan menyentuh Production kecuali release step secara eksplisit mengizinkan.

## 11. Lint Policy

Repository memiliki legacy lint/format debt historis. Karena itu release batch menggunakan:

- changed-scope lint regression = 0;
- changed handwritten files formatted;
- `git diff --check`;
- full build/test.

Jangan melakukan mass-format/mass-lint cleanup di feature batch yang tidak terkait karena menimbulkan diff/noise dan regression risk.

## 12. Severity

### BLOCKER

Contoh:

- cross-tenant data leak;
- credential/service-role leak;
- corruption;
- unintended real payment/message;
- auth bypass;
- deterministic duplicate side effect pada critical workflow.

### HIGH

Contoh:

- material authorization failure;
- unsafe concurrency;
- production fail-open;
- required release UAT incomplete;
- inability to recover critical worker state.

`READY FOR PR` dan `PERMANENTLY CLOSED` mensyaratkan:

```text
BLOCKER = 0
HIGH = 0
```

## 13. Release Lifecycle

```text
Discovery
→ Product decisions
→ Feature worktree/branch
→ Implementation
→ Engineering gates
→ Live/browser/security UAT
→ READY FOR PR
→ Manual PR/merge
→ Post-merge verification
→ Permanent closure
```

Post-merge verification harus berjalan dari **current `origin/main`**, bukan feature worktree lama.

## 14. Test Evidence

Untuk setiap batch, simpan:

- implementation audit report;
- UAT report bila ada;
- operations/runbook bila runtime feature;
- post-merge verification report.

Evidence tidak boleh berisi credential atau real PII.
