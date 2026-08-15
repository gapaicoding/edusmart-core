# EduSmart Core V1 — Build Plan

Verified against the live database: 43 tables, 74 permission codes, 8 seeded roles (ORG_OWNER, SCHOOL_ADMIN, PRINCIPAL, VICE_PRINCIPAL_CURRICULUM, TEACHER, HOMEROOM_TEACHER, PARENT, STUDENT), RBAC helper functions (`has_permission`, `has_staff_scope_permission`, `can_access_student/staff/guardian/assessment/report_card/teaching_assignment/enrollment`), state-transition guard triggers, and audit triggers. Demo tenant seeded: 1 organization, 1 school, 36 students, 10 staff. No schema changes are proposed.

## Shared foundations (built once in Batch 0)

- `useSession` / auth context from Supabase Auth; router gate under `_authenticated/`.
- **Context store**: `activeOrganizationId`, `activeSchoolId`, `activeAcademicYearId`, `activeTermId`, persisted in localStorage, always validated against membership on load. Context is UX/filtering only, never proof of authorization.
- **Permission snapshot hook** (`usePermissions`): loads the signed-in user's memberships, role grants and permission codes with scope, for menu/button visibility only. RLS remains the enforcement layer.
- Data access via TanStack Query + route loaders calling server functions with `requireSupabaseAuth` (RLS applies as the user). No service-role key in browser code.
- Standard states: skeleton loaders, `errorComponent` + `notFoundComponent` on every route with a loader, and empty-states with an action when the user has the create permission.

## Blockers found in the current schema/config

1. **No Storage bucket exists** (0 buckets). `file_assets` and `generated_documents` reference stored files, so Batch 8 PDF generation needs a private bucket plus storage policies. This is a config/migration step to approve before Batch 8 — not a table change.
2. **No permission-summary view or RPC.** The client must assemble the permission snapshot from `organization_memberships` + `membership_roles` + `role_permissions` + `permissions` + `membership_school_access` (4–5 joins per session). Acceptable for V1; if it proves slow we propose a read-only SQL view later rather than caching roles in JWT.
3. **PDF rendering cannot use headless Chromium** in the serverless runtime. Batch 8 must use a pure-JS generator (e.g. pdf-lib/react-pdf) inside a server function.
4. `invitations` exists with a single policy; token issuing/acceptance must run in a privileged server function (hashed, single-use, expiring) — no client-side membership writes.
5. No anonymous grants exist, so every screen is authenticated-only. Confirm that no public marketing/landing surface is required.

## Batch 0 — Foundation UI

- **Routes**: `/` (public sign-in entry), `/auth` (login), `/forgot-password`, `/reset-password`, `/accept-invite`, `/access-pending`, `/select-organization`, `/select-school`, `/_authenticated/dashboard`.
- **Components**: AppShell (sidebar + topbar), OrgSwitcher, SchoolSwitcher, AcademicYearSwitcher, PermissionGate, RoleAwareDashboard cards, UserMenu with sign-out.
- **Tables**: profiles, organizations, schools, organization_memberships, membership_roles, membership_school_access, roles, role_permissions, permissions, academic_years, terms, invitations.
- **Permissions/scopes**: `organization.read`, `school.read`, `academic_year.read`, `membership.read`; scope resolution ORG / SCHOOL / CLASS / OWN / RELATED.
- **RLS-sensitive**: membership self-read; school list must come from `membership_school_access`, never a full `schools` select.
- **Validation**: email format, password policy from provider, invite token validated server-side against intended email + expiry.
- **Acceptance**: login → context resolved → dashboard; user with 0 memberships sees `/access-pending`; single-school user skips the selector; revoked membership loses data access immediately on refetch; parent/teacher/admin see different dashboard cards.

## Batch 1 — Academic Setup

- **Routes**: `/_authenticated/academic/{years,terms,grade-levels,classrooms,subjects}`.
- **Components**: entity DataTable + drawer forms, ArchiveToggle, ActiveYearBadge.
- **Tables**: academic_years, terms, grade_levels, classrooms, subjects, academic_calendar_events, curricula.
- **Permissions**: `academic_year.manage`, `term.manage`, `grade_level.manage`, `classroom.manage`, `subject.manage` (+ `.read`).
- **RLS-sensitive**: all writes scoped to active school; `validate_term_within_year` trigger rejects out-of-range terms — surface it as a field error.
- **Validation**: unique code per school, term dates within year, capacity ≥ 0, archive instead of delete.
- **Acceptance**: create year → term → grade level → classroom → subject in the demo school; term outside year is rejected with a readable message; read-only role sees no create buttons and gets a DB error if forced.

## Batch 2 — SIS

- **Routes**: `/_authenticated/students` (+ `/$id` with tabs: profile, enrollment history, guardians), `/_authenticated/guardians`, `/_authenticated/staff` (+ `/$id`), enrollment dialogs.
- **Components**: StudentTable with filters, StudentForm, GuardianLinkDialog, EnrollmentWizard (school + year + grade level), ClassEnrollmentPicker, StaffSchoolAssignmentEditor.
- **Tables**: students, student_enrollments, class_enrollments, guardians, student_guardians, staff_members, staff_school_assignments.
- **Permissions**: `student.*`, `guardian.*`, `staff.*`, `enrollment.manage`, `class_enrollment.manage`.
- **RLS-sensitive**: `can_access_student` / `can_access_staff` / `can_access_guardian` gate row access; students are org-level, so lists must filter by enrollment in the active school, not by a school column.
- **Validation**: no permanent class/school field on students; one active enrollment per student per year; class enrollment must match the enrollment's school+year (`validate_class_enrollment_consistency`); status transitions guarded by `guard_student_status_transition`.
- **Acceptance**: moving a student to another class preserves the prior class_enrollment row; guardian linked to two students appears under both; ending an enrollment keeps history.

## Batch 3 — Teacher Assignment

- **Routes**: `/_authenticated/teaching-assignments` (list, create, `/$id`).
- **Components**: AssignmentMatrix (teacher × subject × classroom), AssignmentForm, StatusBadge (draft/active/archived).
- **Tables**: teaching_assignments, staff_school_assignments, subjects, classrooms, terms, academic_years.
- **Permissions**: `teaching_assignment.create/read/update/archive`.
- **RLS-sensitive**: `can_access_teaching_assignment`, `owns_teaching_assignment`; teachers see only their own.
- **Validation**: source teacher list from active `staff_school_assignments`, never from role alone; `validate_teaching_assignment_consistency` + `guard_teaching_assignment_transition` errors mapped to the form.
- **Acceptance**: assignment cannot be created for a teacher without a school assignment; archived assignment disappears from selectable sources but keeps history.

## Batch 4 — Schedule

- **Routes**: `/_authenticated/schedule` (weekly grid by classroom/teacher), `/_authenticated/schedule/my` for teachers.
- **Components**: WeeklyGrid, EntryDialog, ConflictBanner, PublishBar.
- **Tables**: timetable_entries, teaching_assignments (source of truth for teacher/subject/class), terms.
- **Permissions**: `schedule.create/read/update/publish/archive`.
- **RLS-sensitive**: draft entries staff-only; published visible to related parent/student.
- **Validation**: client-side pre-check for teacher/classroom overlap, with `validate_timetable_consistency` + `guard_timetable_transition` as the authority; end > start.
- **Acceptance**: overlapping entry blocked with a clear conflict message; publishing flips visibility; parent sees only published.

## Batch 5 — Attendance

- **Routes**: `/_authenticated/attendance` (today's sessions), `/attendance/session/$id`.
- **Components**: SessionOpener (from timetable entry, or manual with mandatory reason), StudentRoster with quick status buttons, SubmitBar, LockedCorrectionDialog.
- **Tables**: attendance_sessions, student_attendance_records, timetable_entries, class_enrollments, staff_attendance_records.
- **Permissions**: `attendance.session.create/record/submit/lock/correct_open/correct_locked/read/export`.
- **RLS-sensitive**: teacher scope limited to own classes via teaching assignment; correction after lock requires the privileged permission and is audited.
- **Validation**: manual session requires a reason; roster derived from active class enrollments on the session date; `guard_attendance_session_transition` drives allowed state changes.
- **Acceptance**: mobile roster is usable one-handed; submitted session becomes read-only; locked correction is recorded in `audit_logs`.

## Batch 6 — Assessment

- **Routes**: `/_authenticated/assessments` (+ `/$id` score entry).
- **Components**: AssessmentForm (type, max score, weight, term), ScoreEntryGrid with inline validation, PublishDialog.
- **Tables**: assessments, assessment_types, student_scores, learning_objectives, assessment_learning_objectives, teaching_assignments.
- **Permissions**: `assessment.create/read/update_own/publish/archive_own`, `score.enter/update_open/update_locked/read/export`.
- **RLS-sensitive**: `can_access_assessment`; unpublished assessments invisible to parents/students.
- **Validation**: score bounds come from the assessment (`validate_student_score`); transitions via `guard_assessment_transition`; bulk save is per-row resilient.
- **Acceptance**: out-of-range score rejected; publishing makes scores visible to related parents only.

## Batch 7 — Parent Portal

- **Routes**: `/_authenticated/portal` (child dashboard), `/portal/schedule`, `/portal/attendance`, `/portal/scores`, `/portal/report-cards`.
- **Components**: ChildSwitcher, mobile-first summary cards, read-only lists.
- **Tables**: guardians, student_guardians, students, student_enrollments, timetable_entries, student_attendance_records, student_scores, report_cards.
- **Permissions/scope**: RELATED, derived from active `student_guardians`; no school-wide access.
- **RLS-sensitive**: child list resolved server-side from the guardian relationship, never from a client-supplied student id.
- **Validation**: switching child changes context only, never permissions; 0 children → support state.
- **Acceptance**: parent cannot read a non-related student even by direct id; only published schedule/scores/report cards appear.

## Batch 8 — Reporting

- **Routes**: `/_authenticated/report-cards` (list, `/$id` editor), review/publish flow.
- **Components**: ReportCardBuilder, SubjectEntryTable (snapshot values), NarrativeEditor, ReviewPublishBar, DownloadButton.
- **Tables**: report_cards, report_card_subject_entries, report_card_narratives, generated_documents, file_assets, student_enrollments, terms.
- **Permissions**: `report_card.generate/read/edit_narrative/submit/review/publish/revise_published/download`.
- **RLS-sensitive**: `can_access_report_card`; parents see published only; revising a published card is privileged and audited.
- **Validation**: entries are snapshots and must not recompute after publish; `validate_report_card_consistency` + `guard_report_card_transition`.
- **Acceptance**: publish then change an assessment → the published card values do not move; PDF generated in a server function and stored in the private bucket; parent download works.

## Sequencing and review

Each batch ends with a manual smoke test against the seeded demo tenant before the next begins. The only approvals expected outside application code are the Storage bucket + policies before Batch 8, and any invite-flow support functions if the existing `invitations` policy proves insufficient.
