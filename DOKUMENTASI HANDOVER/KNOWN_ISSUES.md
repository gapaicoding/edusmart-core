# EduSmart Known Issues & Current Limitations

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


Dokumen ini membedakan **known defect**, **capability gap**, **external dependency**, dan **technical debt**. Tidak semua item di bawah adalah bug.

## Severity Legend

- **Product Gap:** fitur roadmap belum implemented.
- **External Dependency:** source mungkin ada, tetapi outcome membutuhkan provider/account/approval/infrastructure luar.
- **Tech Debt:** tidak memblokir current release tetapi perlu dikelola.
- **Operational:** membutuhkan prosedur/runbook/pilot.

## 1. Real External Communication Provider Belum Ada

**Type:** Product Gap / External Dependency  
**Impact:** Stage 2 tetap OPEN.

B20/B22/B25/B29 telah menyediakan communication domain, queue, retry, contact eligibility, dan worker runtime, tetapi belum ada WhatsApp/email/SMS provider nyata.

Current provider execution pada B29 adalah deterministic Development fake adapter.

**Tidak boleh diklaim:**

- WhatsApp sudah terkirim nyata;
- email provider sudah live;
- Production communication dispatch sudah aktif.

## 2. Communication Provider Receipt/Webhook Belum Ada

**Type:** Product Gap / External Dependency

Belum ada provider-specific callback/receipt runtime untuk delivered/read/provider-failure events.

Diperlukan setelah provider nyata dipilih karena signature, event ID, status mapping, replay protection, dan callback URL bersifat provider-specific.

## 3. WhatsApp Template/Approval Lifecycle Belum Ada

**Type:** Product Gap / External Dependency

PRD menginginkan broadcast WhatsApp, tetapi current system belum mempunyai:

- Meta/provider template approval lifecycle;
- verified sender/business onboarding;
- provider-specific consent/opt-out policy;
- real provider message ID lifecycle.

## 4. Virtual Account Belum Implemented

**Type:** Product Gap

B27 hanya mengimplementasikan Dynamic QRIS dalam scope Midtrans BI-SNAP sandbox. VA bukan bagian dari contract tersebut.

## 5. Midtrans QRIS Belum Menjadi Production-Proven Payment Path

**Type:** External Dependency / Operational

B27 source batch sudah ditutup, tetapi closure tidak mengklaim:

- production credential readiness;
- real production payment;
- end-to-end live provider lifecycle;
- Stage 2 payment completion.

Sandbox credential/public callback availability pernah menjadi external constraint.

## 6. Stage 2 Masih OPEN

**Type:** Product/Roadmap State

Walaupun B18–B29 banyak yang sudah permanently closed, Stage 2 belum selesai karena outcome roadmap seperti real WhatsApp broadcast dan VA belum lengkap.

## 7. AI Assistant Belum Implemented

**Type:** Product Gap

PRD Stage 3 meliputi:

- generator RPP/modul;
- generator soal;
- management summary;
- AI risk insight;
- rate/cost guardrail.

Belum boleh dianggap fitur production.

## 8. LMS/Portfolio Belum Implemented

**Type:** Product Gap

PRD Stage 4 masih roadmap.

## 9. Advanced BI / Executive Analytics Belum Lengkap

**Type:** Product Gap

Operational reporting sudah ada, tetapi roadmap Stage 5 untuk executive/multi-school BI tidak boleh disamakan dengan reporting yang sekarang.

## 10. Native Mobile App Belum Ada

**Type:** Product Gap

Current product adalah web/responsive. Native mobile Stage 6 belum delivered.

## 11. Legacy Repository-Wide Lint/Format Debt

**Type:** Tech Debt

Secara historis repository memiliki global ESLint/format debt yang sudah ada sebelum batch-batch terbaru. Release gate terbaru menggunakan:

- changed-scope lint regression = 0;
- changed-file Prettier;
- full test/build.

Jangan melakukan mass-fix lint/format dalam feature batch tanpa scope khusus karena berisiko menghasilkan diff besar.

## 12. Windows/Line-Ending Tooling Sensitivity

**Type:** Tech Debt / Tooling

Workflow Windows pernah sensitif terhadap CRLF dan tool execution. Gunakan `git diff --check`, repo formatting policy, dan hindari perubahan line-ending massal.

## 13. PRD Tech Stack Tidak Sama dengan Implementasi Aktual

**Type:** Documentation Drift, bukan defect

PRD awal merekomendasikan Next.js/Prisma/Auth.js. Current repo menggunakan TanStack Start + Supabase.

Engineer baru harus mengikuti repository aktual, bukan mengubah stack agar cocok dengan PRD lama.

## 14. Sebagian Dokumen Arsitektur Bersifat Historical/Target Contract

**Type:** Documentation Debt

Dokumen arsitektur lama berguna untuk intent, tetapi migration/source terbaru dapat memiliki domain tambahan yang belum tercermin di ERD lama.

Urutan authority:

`migration/source > current release report > architecture docs > PRD`.

## 15. Retention/Archival Policy Global Belum Terbukti Lengkap

**Type:** Product/Operational Gap

Beberapa domain menggunakan append-only audit/history. Paket ini tidak menemukan bukti satu global data-retention/purge framework yang sudah final untuk seluruh PII/audit domain.

Jangan membuat ad-hoc purge sebelum policy data class disetujui.

## 16. Production Worker Deployment Bukan Outcome B29

**Type:** Operational / External Deployment

B29 membuktikan worker runtime/reliability di Development dan fail-closed behavior. Itu tidak sama dengan bukti always-on Production deployment atau provider integration.

## 17. Tidak Ada Known BLOCKER/HIGH Terbuka dari B29 Closure

Pada baseline dokumentasi ini:

```text
B29 unresolved BLOCKER: 0
B29 unresolved HIGH: 0
```

Jika issue baru ditemukan, tambahkan ke dokumen ini dengan reproduction, severity, affected scope, workaround, dan target batch.
