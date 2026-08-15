# EduSmart — Database ERD & Core Schema Blueprint

**Versi:** 1.0  
**Status:** Logical ERD — Ready for physical SQL migration design  
**Target DB:** PostgreSQL / Supabase  
**Scope:** Foundation + SIS + Teacher Assignment + Schedule + Attendance + Assessment + Parent Portal + Reporting

---

## 1. Prinsip Schema

1. UUID sebagai primary key untuk entity utama.
2. Semua tenant-scoped table menyimpan `organization_id`.
3. Semua school-scoped table menyimpan `school_id`.
4. `created_at` dan `updated_at` wajib untuk mutable entity.
5. Academic history tidak di-overwrite; gunakan enrollment/version/status.
6. Hard delete dibatasi; data operasional penting menggunakan archive/status.
7. RLS aktif pada seluruh exposed table.
8. Auth identity dipisahkan dari domain profile.
9. High-volume table didesain agar dapat dipartisi kemudian.
10. Nama kolom dan enum menggunakan English agar konsisten dengan codebase TypeScript.

---

## 2. High-Level ERD

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ SCHOOLS : owns
    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERSHIPS : has
    PROFILES ||--o{ ORGANIZATION_MEMBERSHIPS : joins
    ORGANIZATION_MEMBERSHIPS ||--o{ MEMBERSHIP_ROLES : assigned
    ROLES ||--o{ MEMBERSHIP_ROLES : grants
    ROLES ||--o{ ROLE_PERMISSIONS : contains
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : maps

    SCHOOLS ||--o{ ACADEMIC_YEARS : has
    ACADEMIC_YEARS ||--o{ TERMS : contains
    SCHOOLS ||--o{ GRADE_LEVELS : defines
    ACADEMIC_YEARS ||--o{ CLASSROOMS : contains
    GRADE_LEVELS ||--o{ CLASSROOMS : groups
    SCHOOLS ||--o{ SUBJECTS : offers

    ORGANIZATIONS ||--o{ STUDENTS : identifies
    ORGANIZATIONS ||--o{ GUARDIANS : identifies
    ORGANIZATIONS ||--o{ STAFF_MEMBERS : identifies
    STUDENTS ||--o{ STUDENT_GUARDIANS : linked
    GUARDIANS ||--o{ STUDENT_GUARDIANS : linked
    STAFF_MEMBERS ||--o{ STAFF_SCHOOL_ASSIGNMENTS : placed
    SCHOOLS ||--o{ STAFF_SCHOOL_ASSIGNMENTS : employs

    STUDENTS ||--o{ STUDENT_ENROLLMENTS : enrolls
    ACADEMIC_YEARS ||--o{ STUDENT_ENROLLMENTS : in
    GRADE_LEVELS ||--o{ STUDENT_ENROLLMENTS : level
    STUDENT_ENROLLMENTS ||--o{ CLASS_ENROLLMENTS : placed
    CLASSROOMS ||--o{ CLASS_ENROLLMENTS : receives

    STAFF_SCHOOL_ASSIGNMENTS ||--o{ TEACHING_ASSIGNMENTS : teaches
    SUBJECTS ||--o{ TEACHING_ASSIGNMENTS : subject
    CLASSROOMS ||--o{ TEACHING_ASSIGNMENTS : class
    TEACHING_ASSIGNMENTS ||--o{ TIMETABLE_ENTRIES : scheduled

    TIMETABLE_ENTRIES ||--o{ ATTENDANCE_SESSIONS : instantiates
    ATTENDANCE_SESSIONS ||--o{ STUDENT_ATTENDANCE_RECORDS : contains
    STUDENT_ENROLLMENTS ||--o{ STUDENT_ATTENDANCE_RECORDS : attends

    TEACHING_ASSIGNMENTS ||--o{ ASSESSMENTS : creates
    ASSESSMENTS ||--o{ STUDENT_SCORES : has
    STUDENT_ENROLLMENTS ||--o{ STUDENT_SCORES : receives

    STUDENT_ENROLLMENTS ||--o{ REPORT_CARDS : receives
    TERMS ||--o{ REPORT_CARDS : period
    REPORT_CARDS ||--o{ REPORT_CARD_SUBJECT_ENTRIES : contains
    SUBJECTS ||--o{ REPORT_CARD_SUBJECT_ENTRIES : reports
```

---

## 3. Schema Groups

```text
CORE
├── organizations
├── schools
├── school_settings

IDENTITY & RBAC
├── profiles
├── organization_memberships
├── membership_school_access
├── roles
├── permissions
├── role_permissions
├── membership_roles
├── invitations

ACADEMIC FOUNDATION
├── academic_years
├── terms
├── grade_levels
├── classrooms
├── subjects
├── curricula
├── learning_outcomes
├── learning_objectives

SIS
├── students
├── guardians
├── student_guardians
├── staff_members
├── staff_school_assignments
├── student_enrollments
├── class_enrollments

TEACHING & SCHEDULE
├── teaching_assignments
├── timetable_entries
├── academic_calendar_events

ATTENDANCE
├── attendance_sessions
├── student_attendance_records
├── staff_attendance_records

ASSESSMENT
├── assessment_types
├── assessments
├── assessment_learning_objectives
├── student_scores

REPORTING
├── report_cards
├── report_card_subject_entries
├── report_card_narratives
├── generated_documents

SYSTEM
├── audit_logs
├── file_assets
```

---

# 4. CORE TABLES

## 4.1 `organizations`

Tenant root.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| code | text unique | human-friendly tenant code |
| name | text | |
| legal_name | text nullable | |
| status | enum | trial/active/suspended/cancelled/archived |
| timezone | text | default `Asia/Jakarta` |
| locale | text | default `id-ID` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## 4.2 `schools`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid FK | organizations |
| code | text | unique within organization |
| name | text | |
| education_stage | enum | paud/tk/sd/smp/sma/smk/other |
| npsn | text nullable | do not require for prototype |
| timezone | text | defaults org timezone |
| status | enum | active/inactive/archived |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Unique:** `(organization_id, code)`

## 4.3 `school_settings`

One-to-one configurable settings.

- school_id
- organization_id
- grading configuration
- attendance configuration
- report branding metadata
- logo file reference

Jangan menaruh logic bisnis penting dalam satu JSON besar. JSONB hanya untuk low-risk configurable settings.

---

# 5. IDENTITY & RBAC

## 5.1 `profiles`

1:1 dengan `auth.users`.

| Column | Type |
|---|---|
| id | uuid PK = auth.users.id |
| full_name | text |
| phone | text nullable |
| avatar_file_id | uuid nullable |
| status | enum active/disabled |
| created_at | timestamptz |
| updated_at | timestamptz |

## 5.2 `organization_memberships`

| Column | Type |
|---|---|
| id | uuid PK |
| organization_id | uuid FK |
| profile_id | uuid FK profiles |
| status | enum invited/active/suspended/ended |
| joined_at | timestamptz nullable |
| ended_at | timestamptz nullable |

**Unique active concept:** profile + organization should not create duplicate active memberships.

## 5.3 `membership_school_access`

Explicit school membership when required.

- id
- organization_id
- membership_id
- school_id
- status

## 5.4 `roles`

Role template may be system-seeded or organization-custom.

- id
- organization_id nullable for system template
- code
- name
- description
- is_system_role
- is_customizable

## 5.5 `permissions`

Global permission registry.

- id
- code unique
- domain
- action
- description

Examples:
- `student.read`
- `student.create`
- `attendance.submit`
- `report_card.publish`

## 5.6 `role_permissions`

- role_id
- permission_id

**Unique:** role_id + permission_id

## 5.7 `membership_roles`

| Column | Notes |
|---|---|
| membership_id | |
| role_id | |
| scope_type | organization/school/class/own/related |
| scope_id | nullable UUID depending on scope |
| starts_at | nullable |
| ends_at | nullable |

User dapat memiliki banyak role.

## 5.8 `invitations`

- organization_id
- school_id nullable
- email
- invited_role_id
- invited_scope_type
- invited_scope_id
- token_hash
- expires_at
- accepted_at
- invited_by_profile_id

Token mentah tidak disimpan.

---

# 6. ACADEMIC FOUNDATION

## 6.1 `academic_years`

| Column | Notes |
|---|---|
| id | uuid |
| organization_id | |
| school_id | |
| code | `2026/2027` |
| name | configurable |
| starts_on | date |
| ends_on | date |
| status | draft/active/closed/archived |
| is_current | boolean derived/controlled |

**Constraint:** ranges valid; only one current academic year per school.

## 6.2 `terms`

Semester/periode.

- organization_id
- school_id
- academic_year_id
- code
- name
- sequence
- starts_on
- ends_on
- status

**Constraint:** term dates inside academic year.

## 6.3 `grade_levels`

- organization_id
- school_id
- code
- name
- sequence
- education_stage
- is_active

Contoh: `GRADE_7`, display name `Kelas 7`.

## 6.4 `classrooms`

- organization_id
- school_id
- academic_year_id
- grade_level_id
- code
- name
- homeroom_staff_school_assignment_id nullable
- capacity nullable
- status

**Unique:** `(school_id, academic_year_id, code)`

Homeroom role dapat disimpan di `homeroom_staff_school_assignment_id` untuk convenience, tetapi authorization tetap melalui `membership_roles` atau assignment yang sinkron.

## 6.5 `subjects`

- organization_id
- school_id
- code
- name
- category
- is_active

## 6.6 `curricula`

Core V1 minimal namun disiapkan.

- organization_id
- school_id
- code
- name
- version
- status

## 6.7 `learning_outcomes`

- curriculum_id
- grade_level_id nullable
- subject_id
- code
- description
- sequence

## 6.8 `learning_objectives`

- learning_outcome_id
- code
- description
- sequence

Implementasi learning outcomes dapat dibuat P1 dalam core jika pilot membutuhkan Kurikulum Merdeka detail. Table disiapkan di ERD agar Assessment tidak terkunci ke sekadar angka.

---

# 7. SIS

## 7.1 `students`

Identity murid pada level Organization, bukan enrollment sekolah.

| Column | Notes |
|---|---|
| id | uuid |
| organization_id | tenant boundary |
| profile_id | nullable jika siswa memiliki login |
| nisn | nullable |
| full_name | |
| preferred_name | nullable |
| gender | nullable/configurable enum |
| birth_date | nullable |
| birth_place | nullable |
| status | active/inactive/alumni/archive |
| created_at | |
| updated_at | |

`students` tidak menyimpan `school_id` sebagai ownership permanen. School affiliation dan nomor siswa internal disimpan pada `student_enrollments`. Ini memungkinkan satu identitas siswa berpindah atau melanjutkan ke School lain dalam Organization yang sama tanpa duplicate identity.

Data sensitif tambahan hanya ditambahkan jika memang digunakan oleh workflow, bukan sekadar karena formulir sekolah biasanya panjang.

## 7.2 `guardians`

- organization_id
- profile_id nullable
- full_name
- phone
- email nullable
- occupation nullable
- status

## 7.3 `student_guardians`

Many-to-many pada level Organization.

- organization_id
- student_id
- guardian_id
- relationship_type
- is_primary
- can_view_academic
- can_view_attendance
- can_receive_notification
- can_manage_permissions
- status

**Unique:** student + guardian active relation.

## 7.4 `staff_members`

Identity personel pada level Organization.

- organization_id
- profile_id nullable
- full_name
- staff_kind (`teacher`, `non_teacher`)
- status

Teacher adalah StaffMember dengan `staff_kind = teacher`. Detail employment per School tidak disimpan di entity ini.

## 7.5 `staff_school_assignments`

Penempatan personel ke School tertentu.

- organization_id
- school_id
- staff_member_id
- employee_number nullable
- employment_status
- position_title nullable
- joined_on
- left_on nullable
- status

Satu StaffMember dapat memiliki lebih dari satu active school assignment.

## 7.6 `student_enrollments`

Represents school-year lifecycle.

- organization_id
- school_id
- student_id
- academic_year_id
- grade_level_id
- student_number nullable (nomor internal pada school)
- enrollment_number nullable
- status draft/active/leave/transferred/withdrawn/graduated
- enrolled_on
- ended_on nullable
- previous_enrollment_id nullable

**Unique:** one valid enrollment per student + school + academic year.

## 7.7 `class_enrollments`

Supports class history inside year.

- organization_id
- school_id
- student_enrollment_id
- classroom_id
- starts_on
- ends_on nullable
- is_primary
- status

Constraint: no overlapping active primary class placement for same student enrollment.

---

# 8. TEACHING ASSIGNMENT & SCHEDULE

## 8.1 `teaching_assignments`

- organization_id
- school_id
- academic_year_id
- term_id nullable
- classroom_id
- subject_id
- staff_school_assignment_id
- role teacher/assistant
- starts_on
- ends_on nullable
- status

This is the source of truth for "teacher teaches subject X in class Y".

## 8.2 `timetable_entries`

Weekly recurring schedule.

- organization_id
- school_id
- academic_year_id
- term_id nullable
- teaching_assignment_id
- weekday
- start_time
- end_time
- room_label nullable
- effective_from
- effective_to nullable
- status draft/published/inactive

Indexes:
- school + weekday + start_time
- staff via teaching assignment
- classroom via teaching assignment

Conflict validation dilakukan service-side dan diperkuat constraint strategy where practical.

## 8.3 `academic_calendar_events`

- organization_id
- school_id
- academic_year_id
- term_id nullable
- title
- event_type
- starts_at / starts_on
- ends_at / ends_on
- affects_instruction

Digunakan untuk libur, ujian, event sekolah, dsb.

---

# 9. ATTENDANCE

## 9.1 `attendance_sessions`

Aktualisasi dari timetable entry pada tanggal tertentu.

- organization_id
- school_id
- academic_year_id
- term_id
- timetable_entry_id nullable
- teaching_assignment_id nullable
- classroom_id
- session_date
- starts_at nullable
- ends_at nullable
- status open/submitted/locked/corrected
- submitted_by_profile_id nullable
- submitted_at nullable
- locked_at nullable

Manual session diperbolehkan tanpa timetable entry tetapi harus memiliki classroom dan reason.

## 9.2 `student_attendance_records`

High-volume table.

- organization_id
- school_id
- attendance_session_id
- student_enrollment_id
- status present/late/excused/sick/absent/other
- check_in_at nullable
- note nullable
- recorded_by_profile_id
- updated_by_profile_id
- created_at
- updated_at

**Unique:** attendance_session_id + student_enrollment_id.

Future partition candidate: by school/year or date range.

## 9.3 `staff_attendance_records`

Untuk requirement presensi guru dasar.

- organization_id
- school_id
- staff_member_id
- attendance_date
- status
- check_in_at
- check_out_at
- note

Bukan payroll timesheet.

---

# 10. ASSESSMENT

## 10.1 `assessment_types`

School-configurable categories.

Examples:
- assignment
- quiz
- daily_test
- midterm
- final
- project
- performance

Fields:
- organization_id
- school_id
- code
- name
- default_weight nullable
- is_active

## 10.2 `assessments`

- organization_id
- school_id
- academic_year_id
- term_id
- teaching_assignment_id
- assessment_type_id
- title
- description nullable
- assessment_date
- min_score default 0
- max_score default 100
- weight nullable
- status draft/open/closed/published/archived
- created_by_profile_id

## 10.3 `assessment_learning_objectives`

Many-to-many Assessment ↔ LearningObjective.

- assessment_id
- learning_objective_id

Optional for first pilot if curriculum detail belum digunakan.

## 10.4 `student_scores`

- organization_id
- school_id
- assessment_id
- student_enrollment_id
- score numeric nullable
- status missing/submitted/excused/final
- feedback nullable
- entered_by_profile_id
- updated_by_profile_id
- updated_at

**Unique:** assessment + student enrollment.

Score bounds validated from Assessment.

---

# 11. REPORTING

## 11.1 `report_cards`

- organization_id
- school_id
- academic_year_id
- term_id
- student_enrollment_id
- version integer
- status draft/submitted/reviewed/published/revised/archived
- homeroom_comment nullable
- attendance_summary JSONB nullable for snapshot
- submitted_at
- reviewed_at
- published_at
- published_by_profile_id

**Unique active version rule:** student enrollment + term + current version.

## 11.2 `report_card_subject_entries`

Snapshot per subject agar published report reproducible.

- organization_id
- school_id
- report_card_id
- subject_id
- final_score nullable
- predicate nullable
- narrative nullable
- source_calculation JSONB nullable

Snapshot sengaja disimpan pada saat generation/publish; laporan historis tidak berubah ketika formula penilaian diubah kemudian.

## 11.3 `report_card_narratives`

Optional structured sections.

- report_card_id
- section_code
- title
- content
- sequence

## 11.4 `generated_documents`

- organization_id
- school_id
- entity_type
- entity_id
- document_type
- file_asset_id
- generated_at
- generated_by_profile_id
- checksum nullable

Digunakan untuk PDF rapor.

---

# 12. SYSTEM TABLES

## 12.1 `audit_logs`

Append-oriented.

- id
- organization_id nullable
- school_id nullable
- actor_profile_id nullable
- actor_type user/system/support
- action
- entity_type
- entity_id
- before_data JSONB nullable
- after_data JSONB nullable
- metadata JSONB nullable
- ip_address nullable
- user_agent nullable
- occurred_at

Indexes:
- organization + occurred_at
- entity_type + entity_id
- actor + occurred_at

## 12.2 `file_assets`

Metadata only; binary lives in Supabase Storage/object storage.

- organization_id
- school_id nullable
- storage_provider
- bucket
- object_path
- original_filename
- mime_type
- size_bytes
- uploaded_by_profile_id
- status

---

# 13. Parent Portal Data Access Map

Tidak perlu tabel portal khusus untuk data akademik.

```text
Guardian Profile
  ↓
Guardian
  ↓
StudentGuardian
  ↓
Student
  ↓
StudentEnrollment
  ├── ClassEnrollment → Classroom → Schedule
  ├── StudentAttendanceRecord
  ├── StudentScore → Assessment
  └── ReportCard
```

Portal preferences dapat ditambahkan kemudian sebagai `portal_preferences`, tetapi bukan core source of truth.

---

# 14. Critical Indexes

Minimum indexes sebelum pilot:

### Tenant
- every school-scoped table: `(organization_id, school_id)`

### Student
- `students(organization_id, nisn)` partial/appropriate unique strategy when NISN exists
- `student_enrollments(school_id, academic_year_id, student_number)` unique when student number exists
- `student_enrollments(student_id, academic_year_id)`
- `class_enrollments(classroom_id, status)`

### Teaching
- `staff_school_assignments(school_id, staff_member_id, status)`
- `teaching_assignments(staff_school_assignment_id, academic_year_id)`
- `teaching_assignments(classroom_id, academic_year_id)`

### Schedule
- `timetable_entries(academic_year_id, weekday, start_time)`

### Attendance
- unique `(attendance_session_id, student_enrollment_id)`
- `(school_id, session_date)` on attendance sessions
- `(student_enrollment_id, created_at)` or session join-friendly index on records

### Assessment
- unique `(assessment_id, student_enrollment_id)`
- `(teaching_assignment_id, term_id)` assessments

### Report
- `(student_enrollment_id, term_id)`

---

# 15. Soft Delete Policy

Gunakan `status`/archive untuk:
- student,
- guardian relation,
- staff,
- classroom,
- subject,
- teaching assignment,
- assessment,
- report card.

`deleted_at` boleh digunakan untuk low-risk configuration entities, tetapi published academic records tidak boleh "hilang" hanya karena soft-delete generic.

---

# 16. Migration Discipline

Setiap perubahan schema harus:

1. dibuat sebagai SQL migration,
2. direview di Git,
3. diuji di dev/staging,
4. menjaga backward compatibility jika production sudah memiliki sekolah aktif,
5. memiliki rollback strategy atau forward-fix strategy,
6. memperbarui generated TypeScript DB types.

Lovable tidak boleh membuat tabel improvisasional tanpa perubahan migration yang dapat direview.

---

# 17. Physical Schema yang Belum Dikunci

Logical ERD ini sengaja belum menentukan beberapa hal berikut sebagai final SQL:

- exact Postgres enum vs lookup table,
- composite FK implementation detail,
- trigger RLS helper implementation,
- partitioning strategy attendance,
- curriculum depth untuk pilot pertama,
- report formula engine.

Hal-hal tersebut harus dikunci saat membuat `DATABASE_SCHEMA.sql` setelah sekolah pilot/academic rules pertama diketahui.

---

# 18. ERD Approval Checklist

ERD siap masuk physical schema jika:

- tidak ada direct `student.class_id` sebagai source of truth,
- StudentEnrollment + ClassEnrollment dipertahankan,
- Guardian many-to-many dipertahankan,
- Teacher assignment terpisah dari user role,
- schedule mengacu ke teaching assignment,
- attendance mengacu ke actual session,
- score mengacu ke assessment,
- report card menyimpan published snapshot,
- semua school data membawa organization + school boundary,
- RLS dapat ditulis tanpa mengambil keputusan domain baru.
