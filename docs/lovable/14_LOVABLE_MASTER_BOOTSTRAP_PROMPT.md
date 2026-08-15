# EduSmart — Lovable Bootstrap Prompt

Read the Project Knowledge first. Then inspect all architecture documents under `/docs/architecture/` and the existing Supabase schema/migrations before making implementation decisions.

This is **EduSmart Core V1**, a multi-tenant School Operating System.

## Important constraints

- Do not redesign the database.
- Do not create duplicate or shortcut tables that conflict with the existing domain model.
- Organization is the tenant boundary; School is an operational unit inside Organization.
- Never implement authorization as a single `user.role` field.
- Respect Membership → Role → Permission → Scope and existing RLS.
- Do not create frontend logic that bypasses RLS.
- Never expose a Supabase secret/service-role key in browser code.
- Preserve StudentEnrollment + ClassEnrollment history.
- Preserve StaffSchoolAssignment + TeachingAssignment separation.
- Parent access must remain relationship-based through StudentGuardian.

## Do not build future modules

Do not add Finance, PPDB/CRM, WhatsApp Center, AI, LMS, HR/Payroll, Library, Inventory, UKS, Tahfidz, or enterprise analytics.

## Core V1 target

1. Authentication
2. Organization / School context
3. Academic Setup
4. SIS
5. Teacher Assignment
6. Schedule
7. Attendance
8. Assessment
9. Parent Portal
10. Basic Reporting

## Current task: PLAN ONLY

Do not implement features yet.

Analyze the existing Supabase schema and architecture, then produce a build plan split into these batches:

### Batch 0 — Foundation UI
- login / forgot password / reset flow
- authenticated app shell
- organization/school context
- active academic year context
- permission-aware navigation
- protected routes
- role-aware dashboard skeleton

### Batch 1 — Academic Setup
- Academic Year
- Term
- Grade Level
- Classroom
- Subject

### Batch 2 — SIS
- Student
- Guardian
- StudentGuardian
- StaffMember
- StaffSchoolAssignment
- StudentEnrollment
- ClassEnrollment

### Batch 3 — Teacher Assignment
- teaching assignment CRUD/workflow
- teacher ↔ subject ↔ classroom mapping

### Batch 4 — Schedule
- weekly timetable
- validation UX for obvious conflicts
- published vs draft state

### Batch 5 — Attendance
- create/open attendance session
- record students
- submit
- lock/correction UX according to permission

### Batch 6 — Assessment
- assessment CRUD
- score entry
- publish state
- parent/student published visibility

### Batch 7 — Parent Portal
- related child resolution
- child switcher
- schedule
- attendance
- published scores
- report cards

### Batch 8 — Reporting
- report card workflow
- subject snapshot
- narrative
- basic PDF generation path

For every batch include:

- pages/routes,
- primary components,
- tables used,
- relevant permissions/scopes,
- RLS-sensitive interactions,
- loading/error/empty states,
- validation requirements,
- acceptance tests.

Explicitly identify anything in the current schema that blocks implementation instead of silently creating a workaround.

Stop after producing the plan. Do not enter implementation/build mode until the plan is reviewed.
