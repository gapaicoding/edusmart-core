# EduSmart — Lovable Project Knowledge

EduSmart is a multi-tenant School Operating System. This project is **Core V1 only**.

## Architectural source of truth

Before changing architecture, read the repository documents under:

`/docs/architecture/`

1. `01_PRODUCT_DOMAIN_MODEL.md`
2. `02_TENANT_ARCHITECTURE.md`
3. `03_DATABASE_ERD.md`
4. `04_RBAC_PERMISSION_MATRIX.md`
5. `05_AUTHENTICATION_ARCHITECTURE.md`
6. `06_ACADEMIC_STRUCTURE.md`

The Supabase migrations/schema are authoritative for the physical database.

## Critical hierarchy

```text
Platform
→ Organization / Tenant
→ School
→ Academic Year
→ Grade Level
→ Classroom
```

`Organization` is the tenant boundary. A School belongs to exactly one Organization.

Never redesign tenant as `tenant = school`.

## Identity rules

Authentication uses Supabase Auth.

Business identity is separate:

```text
auth.users
→ profiles
→ organization_memberships
→ membership_roles
→ roles
→ permissions
→ scope
```

Never implement `users.role` as the authorization source.

A user may have multiple roles and multiple scopes.

## Authorization scopes

- `ORG`
- `SCHOOL`
- `CLASS`
- `OWN`
- `RELATED`

RLS is mandatory and is the final database enforcement layer.

Frontend route guards and hidden buttons are UX only; they never replace RLS.

Never expose Supabase service-role/secret keys to browser code.

## Student model

`Student` is an Organization-level person record.

School lifecycle is represented by:

```text
Student
→ StudentEnrollment
→ School + AcademicYear + GradeLevel
→ ClassEnrollment
→ Classroom
```

Never add a permanent `students.class_id` or `students.school_id` as the source of truth.

## Guardian / Parent model

Guardian relationship is many-to-many:

```text
Guardian
↔ StudentGuardian
↔ Student
```

Parent Portal authorization is `RELATED`, derived from active StudentGuardian relationships.

Never grant parents school-wide access to student data.

## Staff model

Staff identity belongs to Organization:

```text
StaffMember
→ StaffSchoolAssignment
→ School
```

Teaching is represented by:

```text
TeachingAssignment
= StaffSchoolAssignment + Subject + Classroom + AcademicYear/Term
```

Do not infer teaching authority from a generic Teacher role alone.

## Teacher scope

Default Teacher role is `CLASS` scoped.

If a teacher handles multiple classes, the membership receives multiple class grants.

A CLASS/SCHOOL role grant requires active `membership_school_access` to its owning School.

## Academic model

Academic hierarchy:

```text
School
→ AcademicYear
→ Term
→ GradeLevel
→ Classroom
```

Subjects are School-scoped.

Curriculum, LearningOutcome and LearningObjective are available for Kurikulum Merdeka compatibility, but deep curriculum workflows are not required in the first UI batch.

## Schedule

Schedule source of truth:

```text
TeachingAssignment
→ TimetableEntry
```

Do not create duplicated teacher/class/subject fields on timetable if they can be resolved from TeachingAssignment.

Published timetable is visible to Parent/Student where related/own. Draft timetable is staff-only.

## Attendance

Actual attendance is not stored directly on timetable.

```text
TimetableEntry
→ AttendanceSession (actual date)
→ StudentAttendanceRecord
```

Manual AttendanceSession is allowed only with an explicit reason.

Locked attendance correction is privileged and audited.

## Assessment

```text
TeachingAssignment
→ Assessment
→ StudentScore
```

Score bounds come from Assessment.

Parents/students can only see published assessments/scores. Staff access follows RBAC scope.

## Reporting

```text
StudentEnrollment + Term
→ ReportCard
→ ReportCardSubjectEntry
→ generated PDF
```

Published report cards are snapshots. Historic published results must not silently change when assessment formulas change later.

Parent/student visibility is limited to published report cards.

## Core V1 scope

Build only:

1. Authentication
2. Organization/School context
3. Academic Setup
4. SIS
5. Teacher Assignment
6. Schedule
7. Attendance
8. Assessment
9. Parent Portal
10. Basic Reporting

Do NOT introduce yet:

- Finance
- Billing/payment
- PPDB/CRM
- WhatsApp Center
- AI Assistant
- LMS
- HR/Payroll
- Library
- Inventory
- UKS
- Tahfidz
- Enterprise analytics

## Development rules

- Supabase schema already exists. Do not invent replacement tables.
- Every schema change must be migration-based and reviewed.
- Prefer status/archive lifecycle over hard delete for academic/business records.
- Never bypass RLS from browser code.
- Use Supabase publishable client key only in frontend.
- Privileged bulk/transactional operations belong in trusted server/Edge Function later.
- Maintain mobile-friendly UX for Teacher, Parent and Student.
- Admin/TU screens may be desktop-optimized but must remain responsive.
- Build incrementally and test after every module batch.
