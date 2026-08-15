# EduSmart Core V1 — Build Plan (Revised)

Verified against the live database: **42 public base tables** (confirmed twice: `information_schema.tables` and `pg_class` both return 42), 74 permission codes, 8 seeded roles (ORG_OWNER, SCHOOL_ADMIN, PRINCIPAL, VICE_PRINCIPAL_CURRICULUM, TEACHER, HOMEROOM_TEACHER, PARENT, STUDENT), RBAC helper functions (`has_permission`, `has_permission_in_org`, `has_staff_scope_permission`, `can_access_student/staff/guardian/assessment/report_card/teaching_assignment/enrollment`), state-transition guard triggers, and audit triggers. Demo tenant seeded: 1 organization, 1 school, 36 students, 10 staff. No schema changes are proposed.

## 1. Table count verification

The earlier "43 tables" figure was an error in my own summary, not a real extra table. A direct count returns **42**, exactly matching the architecture foundation. Full list:

```text
academic_calendar_events, academic_years, assessment_learning_objectives,
assessment_types, assessments, attendance_sessions, audit_logs,
class_enrollments, classrooms, curricula, file_assets, generated_documents,
grade_levels, guardians, invitations, learning_objectives, learning_outcomes,
membership_roles, membership_school_access, organization_memberships,
organizations, permissions, profiles, report_card_narratives,
report_card_subject_entries, report_cards, role_permissions, roles,
school_settings, schools, staff_attendance_records, staff_members,
staff_school_assignments, student_attendance_records, student_enrollments,
student_guardians, student_scores, students, subjects, teaching_assignments,
terms, timetable_entries
```

There is **no additional, duplicate, or replacement table**. Nothing is to be altered or removed.

## 2. Supabase Auth configuration checklist (configuration only)

To be applied in the Supabase dashboard / project auth settings before Batch 0 is testable. No schema changes.

- **Site URL**: the published app URL (production). 
- **Additional redirect URLs**: the Lovable preview URL, the stable `project--<id>-dev.lovable.app` preview URL, plus `.../reset-password`, `.../accept-invite`, and any custom domain. Wildcards only where the dashboard requires them for preview hosts.
- **Sign in**: email + password provider enabled; email confirmation left ON (default). Sign-in errors surfaced as generic "invalid credentials" (enumeration-resistant).
- **Forgot password**: `resetPasswordForEmail(email, { redirectTo: '<origin>/reset-password' })`; the recovery email template must point at that path.
- **Reset password**: a public `/reset-password` route that detects the recovery session from the URL and calls `supabase.auth.updateUser({ password })`. Without it users land signed in without resetting.
- **Invitation acceptance**: a public `/accept-invite` route. The invite email links to `<origin>/accept-invite?token=…`; the token is validated server-side (hashed, single-use, expiring, matched to the intended email). Magic-link/OTP expiry kept short.
- **Password policy**: minimum length and leaked-password protection enabled where the plan allows; login rate limiting left at provider defaults or tighter.
- **MFA**: optional in pilot; recommended later for ORG_OWNER / SCHOOL_ADMIN / PRINCIPAL.
- **Email templates**: confirm, recovery and invite templates reviewed so links resolve to allowed redirect URLs.

## 3. Server-function execution model (user context, RLS authoritative)

- Every ordinary read and write runs through `createServerFn` + `requireSupabaseAuth`, using `context.supabase` — the client built from the caller's access token. `auth.uid()` is real and RLS is the enforcement layer for all CRUD.
- The bearer attacher is registered as global `functionMiddleware` in `src/start.ts` so the token travels with every server-function call.
- **No service-role/secret credential is used for ordinary CRUD and never to bypass RLS.** `supabaseAdmin` is loaded only inside a handler, only for explicitly privileged workflows: invitation issuance/acceptance (token hashing, membership activation) and, later if needed, audited bulk import. Those handlers verify the caller's permission through `context.supabase` first.
- No secret key ever reaches browser code; the frontend uses only the publishable key.
- Client-side permission snapshots and hidden menu items are UX only.

## 4. Shared foundations (built once in Batch 0)

- Auth context from Supabase Auth; router gate under `_authenticated/`.
- **Context store**: `activeOrganizationId`, `activeSchoolId`, `activeAcademicYearId`, `activeTermId`, persisted locally, always re-validated against membership on load. Context is filtering/UX only, never proof of authorization.
- **Permission snapshot hook** (`usePermissions`): assembles the signed-in user's codes and scopes from `organization_memberships` + `membership_roles` + `role_permissions` + `permissions` + `membership_school_access`.
- Data access via TanStack Query + loaders calling authenticated server functions.
- Standard states: skeleton loaders, `errorComponent` + `notFoundComponent` on every route with a loader, empty states with an action when the user holds the create permission.

## 5. Blockers found in the current schema/config

1. **No Storage bucket exists** (0 buckets). `file_assets` and `generated_documents` reference stored files, so Batch 8 needs a private bucket plus `storage.objects` policies — a config/storage step to approve before Batch 8, not a table change.
2. **No permission-summary view or RPC.** The snapshot needs a 4–5 join query per session. Acceptable for V1; if slow, propose a read-only SQL view later rather than putting the RBAC matrix in the JWT.
3. **PDF rendering cannot use headless Chromium** in the serverless runtime; Batch 8 uses a pure-JS generator inside a server function.
4. `invitations` has a single policy; token issuing/acceptance runs in a privileged server function. No client-side membership writes.
5. No anonymous grants exist, so every screen is authenticated-only. Confirm no public marketing surface is required.

---

## Batch 0 — Foundation UI

- **Routes**: `/` (public sign-in entry), `/auth`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/access-pending`, `/select-organization`, `/select-school`, `/_authenticated/dashboard`.
- **Components**: AppShell, OrgSwitcher, SchoolSwitcher, AcademicYearSwitcher, PermissionGate, RoleAwareDashboard cards, UserMenu with sign-out.
- **Tables**: profiles, organizations, schools, organization_memberships, membership_roles, membership_school_access, roles, role_permissions, permissions, academic_years, terms, invitations.
- **Permission codes**: `organization.read`, `school.read`, `academic_year.read`, `term.read`, `membership.read`, `role.read`, `membership.invite`. Scopes ORG / SCHOOL / CLASS / OWN / RELATED.
- **RLS-sensitive**: membership self-read; school list derived from `membership_school_access`, never a bare `schools` select.
- **Validation**: email format; provider password policy; invite token validated server-side against intended email + expiry, single-use.
- **Acceptance**: login → context resolved → dashboard; 0 memberships → `/access-pending`; single-school user skips the selector; revoked membership loses data on refetch; roles see different dashboard cards; password reset completes end to end.

## Batch 1 — Academic Setup

- **Routes**: `/_authenticated/academic/{years,terms,grade-levels,classrooms,subjects}`.
- **Components**: DataTable + drawer forms, ArchiveToggle, ActiveYearBadge.
- **Tables**: academic_years, terms, grade_levels, classrooms, subjects, academic_calendar_events, curricula.
- **Permission codes**: `academic_year.read`, `academic_year.manage`, `term.read`, `term.manage`, `grade_level.read`, `grade_level.manage`, `classroom.read`, `classroom.manage`, `subject.read`, `subject.manage`, `curriculum.read`, `curriculum.manage`.
- **RLS-sensitive**: writes scoped to the active school; `validate_term_within_year` errors surfaced as field errors.
- **Validation**: unique code per school, term inside year, capacity ≥ 0, archive instead of delete.
- **Acceptance**: year → term → grade level → classroom → subject created in the demo school; out-of-range term rejected readably; read-only role sees no create buttons and is refused by the DB if forced.

## Batch 2 — SIS

- **Routes**: `/_authenticated/students` (+ `/$id`: profile, enrollment history, guardians), `/_authenticated/guardians`, `/_authenticated/staff` (+ `/$id`).
- **Components**: StudentTable with filters, StudentForm, GuardianLinkDialog, EnrollmentWizard, ClassEnrollmentPicker, StaffSchoolAssignmentEditor.
- **Tables**: students, student_enrollments, class_enrollments, guardians, student_guardians, staff_members, staff_school_assignments.
- **Permission codes**: `student.read`, `student.create`, `student.update`, `student.archive`, `student.import`, `student.export`, `guardian.read`, `guardian.manage`, `staff.read`, `staff.create`, `staff.update`, `enrollment.read`, `enrollment.manage`, `class_enrollment.manage`.
- **RLS-sensitive**: `can_access_student`, `can_access_staff`, `can_access_guardian`; students are org-level, so lists filter by enrollment in the active school, never by a school column on students.
- **Validation**: no permanent class/school field on students; one active enrollment per student per year; class enrollment matches the enrollment's school+year (`validate_class_enrollment_consistency`); `guard_student_status_transition` respected.
- **Acceptance**: moving a student between classes preserves the earlier class_enrollment row; a guardian linked to two students appears under both; ending an enrollment keeps history.

## Batch 3 — Teacher Assignment

- **Routes**: `/_authenticated/teaching-assignments` (list, create, `/$id`).
- **Components**: AssignmentMatrix (teacher × subject × classroom), AssignmentForm, StatusBadge.
- **Tables**: teaching_assignments, staff_school_assignments, subjects, classrooms, terms, academic_years.
- **Permission codes**: `teaching_assignment.read`, `teaching_assignment.create`, `teaching_assignment.update`, `teaching_assignment.archive`.
- **RLS-sensitive**: `can_access_teaching_assignment`, `owns_teaching_assignment`; teachers see only their own.
- **Validation**: teacher options sourced from active `staff_school_assignments`, never from role alone; consistency/transition trigger errors mapped to form fields.
- **Acceptance**: assignment blocked for a teacher without a school assignment; archived assignments leave the picker but keep history.

## Batch 4 — Schedule

- **Routes**: `/_authenticated/schedule` (weekly grid by classroom/teacher), `/_authenticated/schedule/my`.
- **Components**: WeeklyGrid, EntryDialog, ConflictBanner, PublishBar.
- **Tables**: timetable_entries, teaching_assignments, terms.
- **Permission codes**: `schedule.read`, `schedule.create`, `schedule.update`, `schedule.publish`, `schedule.archive`.
- **RLS-sensitive**: draft entries staff-only; published entries visible to related parent/student.
- **Validation**: client pre-check for teacher/classroom overlap with `validate_timetable_consistency` + `guard_timetable_transition` as authority; end > start.
- **Acceptance**: overlapping entry blocked with a clear message; publish flips visibility; parent sees published only.

## Batch 5 — Attendance

- **Routes**: `/_authenticated/attendance`, `/_authenticated/attendance/session/$id`.
- **Components**: SessionOpener (from timetable entry, or manual with mandatory reason), StudentRoster with quick status buttons, SubmitBar, LockedCorrectionDialog.
- **Tables**: attendance_sessions, student_attendance_records, timetable_entries, class_enrollments, staff_attendance_records.
- **Permission codes**: `attendance.session.create`, `attendance.record`, `attendance.submit`, `attendance.read`, `attendance.lock`, `attendance.correct_open`, `attendance.correct_locked`, `attendance.export`.
- **RLS-sensitive**: teacher limited to own classes via teaching assignment; post-lock correction requires the privileged code and is audited.
- **Validation**: manual session requires a reason; roster derived from active class enrollments on the session date; `guard_attendance_session_transition` drives state changes.
- **Acceptance**: mobile roster usable one-handed; submitted session read-only; locked correction lands in `audit_logs`.

## Batch 6 — Assessment

- **Routes**: `/_authenticated/assessments` (+ `/$id` score entry).
- **Components**: AssessmentForm, ScoreEntryGrid with inline validation, PublishDialog.
- **Tables**: assessments, assessment_types, student_scores, learning_objectives, assessment_learning_objectives, teaching_assignments.
- **Permission codes**: `assessment.read`, `assessment.create`, `assessment.update_own`, `assessment.publish`, `assessment.archive_own`, `score.read`, `score.enter`, `score.update_open`, `score.update_locked`, `score.export`.
- **RLS-sensitive**: `can_access_assessment`; unpublished assessments invisible to parents/students.
- **Validation**: bounds from the assessment (`validate_student_score`); `guard_assessment_transition`; bulk save resilient per row.
- **Acceptance**: out-of-range score rejected; publishing exposes scores to related parents only.

## Batch 7 — Parent Portal

- **Routes**: `/_authenticated/portal`, `/portal/schedule`, `/portal/attendance`, `/portal/scores`, `/portal/report-cards`.
- **Components**: ChildSwitcher, mobile-first summary cards, read-only lists.
- **Tables**: guardians, student_guardians, students, student_enrollments, timetable_entries, student_attendance_records, student_scores, report_cards.
- **Permission codes**: `student.read`, `schedule.read`, `attendance.read`, `score.read`, `report_card.read`, `report_card.download` — all resolved at RELATED scope from active `student_guardians`.
- **RLS-sensitive**: child list resolved server-side from the guardian relationship, never from a client-supplied student id.
- **Validation**: switching child changes context only, never permissions; 0 children → support state.
- **Acceptance**: parent cannot read a non-related student even by direct id; only published schedule/scores/report cards appear.

## Batch 8 — Reporting

- **Routes**: `/_authenticated/report-cards` (list, `/$id` editor), review/publish flow.
- **Components**: ReportCardBuilder, SubjectEntryTable (snapshots), NarrativeEditor, ReviewPublishBar, DownloadButton.
- **Tables**: report_cards, report_card_subject_entries, report_card_narratives, generated_documents, file_assets, student_enrollments, terms.
- **Permission codes**: `report_card.read`, `report_card.generate`, `report_card.edit_narrative`, `report_card.submit`, `report_card.review`, `report_card.publish`, `report_card.revise_published`, `report_card.download`.
- **RLS-sensitive**: `can_access_report_card`; parents see published only; revising a published card is privileged and audited.
- **Validation**: entries are snapshots and must not recompute after publish; `validate_report_card_consistency` + `guard_report_card_transition`.
- **Acceptance**: after publish, changing an assessment does not move published values; PDF generated server-side into the private bucket; parent download works.

---

## Confirmations

- No Core V1 schema redesign; the 42 existing tables stay as they are.
- No duplicate or shortcut tables.
- No simplified `user.role` authorization — Membership → Role → Permission → Scope only.
- No RLS bypass anywhere in application CRUD; service-role credentials stay server-only and are reserved for invitation issuance/acceptance.
- No Finance, PPDB/CRM, WhatsApp Center, AI, LMS, HR/Payroll, Library, Inventory, UKS, Tahfidz, or enterprise analytics.
- Each batch is independently testable and must pass its smoke test against the seeded demo tenant before the next batch begins.
- Only permission codes that exist in the live `permissions` registry are used above.
