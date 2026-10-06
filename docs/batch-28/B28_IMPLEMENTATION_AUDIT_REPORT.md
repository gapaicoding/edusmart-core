# Batch 28 Implementation Audit

## Final pre-merge release decision (2026-10-06)

**READY FOR PR. BLOCKER 0; HIGH 0.** This result supersedes all prior interim not-ready conclusions in earlier audit drafts. It records the final B28 pre-merge state.

### Baseline and branch

- Baseline: 10ed4bfff7ec37baa1519e3d65769a85aeb93a75.
- Feature branch: feat/b28-preapplication-lead-management.
- Feature commit: 4efaf1ee03b52a92b441766da50961385dd5043c.
- Worktree: D:/edusmart-worktrees/edusmart-core-b28.
- Development migration parity: 106 local = 106 remote; B28 migrations applied: 2.

### Domain and security design

- B28 adds school-scoped pre-application leads, append-only activities, and a bounded request/idempotency ledger. The lead lifecycle is NEW → CONTACTED → QUALIFIED → CONVERTED, with terminal CLOSED available from non-terminal states.
- Required capabilities are admission.lead.read, admission.lead.manage, and admission.lead.convert. UI/server commands resolve capabilities in the active school context; authorization does not rely on role-name inference.
- Lead, activity, and command tables use RLS and FORCE RLS. Direct browser table grants are revoked; anonymous table privileges and authenticated direct-write privileges are absent. Access uses authenticated server functions and school-scoped RPCs.
- Optional assignment validates active staff, active membership, and same-school access. Contact normalization is deterministic and duplicate lookup includes the authorized school; duplicate results are advisory and do not auto-merge or block an operator-selected create.
- Lead notes are bounded operational activity. No hard delete, automatic retention purge, external messaging, campaign entity, or public anonymous intake was added.
- Conversion requires a QUALIFIED lead, authorized school, valid open B18 cycle, request idempotency, and the existing B18 staff-entry consent contract. It calls the B18 application boundary, links the resulting formal application, records conversion history, and makes the lead terminal CONVERTED.
- B28 does not directly create Student, Guardian, StudentGuardian, or StudentEnrollment records and does not accept an application. B18 retains review, decision, acceptance, and SIS conversion authority. B23 follow-up remains application-bound.
- Migration files are append-only: 20261005100000_b28_preapplication_lead_management.sql and 20261005110000_b28_lead_contract_hardening.sql. No older migration was edited or removed.

### Post-implementation engineering evidence

- B18 foundation validator: PASS.
- B18 phase-2 validator: PASS.
- B23 validator: PASS.
- B28 validator: PASS.
- Focused B18/B23/B28 suite: 28 passed, 0 failed.
- Full suite: 724 passed, 0 failed, 78 files.
- TypeScript: PASS.
- B28 changed-scope ESLint and Prettier: PASS; no new lint or format regression.
- git diff --check: PASS.
- Production build: PASS.

### Browser and Development evidence

The final browser evidence is in B28_BROWSER_UAT_REPORT.md. It covers lifecycle/conversion, duplicate advisory, School A/B isolation, anonymous access, Parent/Teacher/Student denial, ID/EN, Light/Dark, responsive widths, keyboard/focus, clean authorized network capture, and payload review.

Final Development totals: 15 B28 leads, 41 activities, 2 converted leads, 2 B18-linked leads. Final security closure additions were 1 synthetic foreign-school lead and 1 CREATED activity; no application or Auth user was added/changed during that closure. Development Auth normalization 21/21 is Product Owner reported. Production data/migrations/Auth changes, provider calls, external messages, and real payments: 0.

### Findings and release status

- BLOCKER: 0.
- HIGH: 0.
- MEDIUM: synthetic QA data remains in Development for evidence; no automatic cleanup policy was introduced, consistent with the approved scope.
- External: none in scope.
- B28: READY FOR PR at feature commit 4efaf1ee03b52a92b441766da50961385dd5043c.
- Stage 2 remains OPEN. B28 was not permanently closed before post-merge verification. Batch 29 was not started.

### Historical QA harness notes

Prior incomplete attempts included a disabled-submit expectation before required fields were filled, an unsupported direct REST helper, an incorrect aria-label selector for a label-associated control, missing post-mutation synchronization, and manually constructed requests initially lacking authenticated server-function headers. Final browser checks corrected those methods; no product source change was required. Earlier interim not-ready statements and counts are historical and superseded by the final evidence above.

## Post-merge verification (2026-10-06)

PR #23 merged as `427311cc4df6615122b886cae77fef808542347b`, the verified current `origin/main`. The feature commit is contained in main. Post-merge migration parity, validators, read-only anomaly audit, focused/full regression, TypeScript, changed-scope lint, formatting, diff, and build passed. The post-merge browser smoke passed for Admissions, B18 application linkage, foreign-school isolation/no-oracle, anonymous, Parent, Teacher, Student, localization, theme, and clean authorized network behavior. See [B28_POST_MERGE_VERIFICATION_REPORT.md](B28_POST_MERGE_VERIFICATION_REPORT.md) for evidence and counts.

**Current decision: BATCH 28 PERMANENTLY CLOSED. BLOCKER 0; HIGH 0.** Stage 2 remains OPEN. Batch 29 is NOT STARTED.
