# EduSmart — Tenant Architecture

**Versi:** 1.0  
**Status:** Foundation Architecture — Decision Locked for Core MVP  
**Database target:** PostgreSQL / Supabase  
**Model tenancy:** Shared database, shared schema, row-level isolation

---

## 1. Tujuan

Dokumen ini menetapkan bagaimana EduSmart memisahkan data antar pelanggan, bagaimana yayasan multi-sekolah dimodelkan, bagaimana user dapat memiliki akses ke lebih dari satu school, dan bagaimana RLS serta RBAC bekerja bersama.

PRD mensyaratkan multi-tenancy, isolasi data ketat, RBAC granular, auditability, dan kemampuan berkembang dari satu sekolah ke multi-sekolah/yayasan. Arsitektur berikut adalah implementasi konkret dari requirement tersebut.

---

## 2. Keputusan Utama

### 2.1 Tenant = Organization

```text
PLATFORM
└── Organization / Tenant
    ├── School 1
    ├── School 2
    └── School N
```

Organization dapat berupa:
- Yayasan,
- perusahaan/operator pendidikan,
- sekolah independen.

Sekolah independen tetap menggunakan:

```text
Organization X
└── School X
```

Tidak ada mode khusus yang mengubah schema.

---

## 3. Hierarchy Resmi Core V1

```text
Platform
  ↓
Organization
  ↓
School
  ↓
Academic Year
  ↓
Grade Level
  ↓
Classroom
```

Hierarchy akses user berbeda:

```text
User Profile
  ↓
Organization Membership
  ↓
School Access / Role Scope
```

### Tidak dimasukkan sebagai entity wajib pada Core V1

- Campus
- Branch
- Academic Unit terpisah
- Department

Jika sekolah pilot membuktikan kebutuhan campus multi-lokasi, entity `campuses` dapat ditambahkan di antara School dan Classroom tanpa mengubah Tenant boundary.

---

## 4. Data Ownership Rules

### Organization-scoped
Contoh:
- organization settings,
- organization memberships,
- organization-level roles,
- Student identity,
- Guardian identity,
- StaffMember identity,
- future subscription/billing SaaS.

Wajib memiliki:

```text
organization_id
```

### School-scoped
Contoh:
- student enrollments,
- staff school assignments,
- academic years,
- classes,
- subjects,
- schedules,
- attendance,
- assessments,
- report cards.

Wajib memiliki:

```text
organization_id
school_id
```

Meskipun `school_id` secara teoritis bisa menurunkan `organization_id`, duplikasi terkontrol `organization_id` dipertahankan untuk:
- RLS yang lebih sederhana,
- query tenant isolation yang cepat,
- composite constraint,
- audit,
- mengurangi risiko join lintas tenant.

---

## 5. Tenant Isolation Strategy

EduSmart menggunakan empat lapis proteksi.

```text
1. UI visibility
      ↓
2. Application authorization
      ↓
3. PostgreSQL RLS
      ↓
4. FK / constraint tenant consistency
```

Tidak satu pun lapisan dianggap cukup sendirian.

### Rule utama

- Client tidak boleh menentukan `organization_id` secara bebas tanpa validasi.
- Semua write harus memastikan target record berada dalam tenant yang sama dengan membership aktif.
- Service-role key tidak pernah berada di browser.
- Query privileged wajib berjalan di trusted server/edge function.

---

## 6. Membership Model

### profiles
Identitas aplikasi yang terhubung 1:1 dengan `auth.users`.

### organization_memberships
Menandakan seorang profile menjadi anggota Organization.

Field konsep:

```text
id
organization_id
profile_id
status
joined_at
ended_at
```

### membership_school_access
Digunakan bila role user hanya berlaku pada school tertentu.

```text
membership_id
school_id
```

### membership_roles
Menghubungkan membership dengan role dan scope.

Contoh:

```text
Budi
Organization: Yayasan ABC
Role: Principal
Scope: SCHOOL
Scope ID: School A
```

atau:

```text
Siti
Organization: Yayasan ABC
Role: Organization Owner
Scope: ORGANIZATION
```

---

## 7. Scope Model

Scope resmi:

| Scope | Makna |
|---|---|
| PLATFORM | Seluruh platform; internal EduSmart saja |
| ORGANIZATION | Seluruh school dalam satu tenant |
| SCHOOL | Seluruh data satu school |
| CLASS | Classroom tertentu yang ditugaskan |
| OWN | Record milik user sendiri |
| RELATED | Relasi bisnis eksplisit, contoh Guardian → Child |

Scope bukan permission. Permission menjawab **boleh melakukan apa**, scope menjawab **pada data mana**.

Contoh:

```text
Permission: student.read
Scope: SCHOOL
```

berbeda dengan:

```text
Permission: student.read
Scope: CLASS
```

---

## 8. Active Organization / Active School

Untuk UX, aplikasi boleh memiliki context aktif:

```text
activeOrganizationId
activeSchoolId
activeAcademicYearId
```

Tetapi nilai tersebut hanya filter/navigation context.

**Authorization tidak boleh mempercayai activeSchoolId dari client.** Server/RLS tetap memverifikasi membership.

---

## 9. User dengan Multi-School Access

Contoh:

```text
Profile: Ahmad
Organization: Yayasan Maju
├── School SD Maju → Principal
└── School SMP Maju → Teacher
```

Setelah login:

```text
Auth Session
  ↓
Load Memberships
  ↓
Choose Organization
  ↓
Choose School if needed
  ↓
Load Role + Permission + Scope
```

UI menampilkan school switcher hanya jika user memiliki lebih dari satu school scope.

---

## 10. Guardian Access

Guardian tidak mendapatkan akses melalui general `student.read:school`.

Student identity berada di level Organization, sedangkan school visibility ditentukan oleh StudentEnrollment. Guardian menggunakan scope `RELATED`.

Relasi source of truth:

```text
profile
  ↓ optional link
Guardian
  ↓
StudentGuardian
  ↓
Student
```

RLS harus memastikan Guardian hanya melihat siswa yang relasinya:
- aktif,
- tidak dicabut,
- berada pada tenant/school yang sesuai.

Jika satu parent memiliki anak di dua school berbeda di organization yang sama, portal dapat menampilkan keduanya berdasarkan enrollment masing-masing tanpa menduplikasi Student/Guardian identity.

---

## 11. Student Account Access

Untuk Core V1, Student account dapat bersifat optional.

Jika diaktifkan:

```text
auth.users
  ↓
profiles
  ↓
students.profile_id
```

Student hanya mendapat scope `OWN` untuk data akademiknya sendiri.

---

## 12. Platform Admin

Platform Admin adalah personel internal EduSmart, **bukan role tenant biasa**.

Aturan:
- Tidak muncul di role management sekolah.
- Tidak otomatis memiliki akses konten tenant.
- Support access ke tenant harus eksplisit dan diaudit.
- Tidak boleh menggunakan service-role key untuk aktivitas rutin di UI admin.

### Future support session

```text
Support Request
  → Tenant approval / internal policy
  → Temporary Access Grant
  → Expiry
  → Audit Log
```

Core V1 boleh menunda UI ini, tetapi model auth tidak boleh mengandalkan superadmin yang bebas membuka seluruh data.

---

## 13. PostgreSQL RLS Pattern

### Helper concept

Database menyediakan helper function aman seperti:

```text
current_profile_id()
has_org_membership(org_id)
has_school_permission(permission_code, school_id)
has_related_student(student_id)
```

RLS policy tidak sebaiknya berisi logic panjang yang disalin ke puluhan tabel.

### Contoh policy konseptual student read

```sql
USING (
  has_school_permission('student.read', school_id)
  OR has_related_student(id)
)
```

### Write

Write policy wajib lebih ketat daripada read.

```text
SELECT permission ≠ UPDATE permission
```

---

## 14. Composite Tenant Consistency

Foreign key biasa dapat memastikan entity ada, tetapi tidak selalu memastikan entity berada di tenant yang sama.

Untuk table kritis, gunakan salah satu:

1. composite FK (`organization_id`, `school_id`, `entity_id`), atau
2. trigger/constraint function tervalidasi, atau
3. trusted service validation + RLS + database constraints.

Prioritas untuk:
- student_enrollments,
- class_enrollments,
- teaching_assignments,
- timetable_entries,
- attendance,
- assessments,
- scores.

---

## 15. Tenant Provisioning Flow

```text
Create Organization
  ↓
Create First School
  ↓
Create Owner Membership
  ↓
Create Default Roles
  ↓
Create Academic Settings
  ↓
Invite School Admin
  ↓
Create Academic Year
```

Semua dijalankan transactionally sejauh mungkin.

---

## 16. Tenant Deactivation

Organization memiliki status:

```text
TRIAL
ACTIVE
SUSPENDED
CANCELLED
ARCHIVED
```

School memiliki status:

```text
ACTIVE
INACTIVE
ARCHIVED
```

Suspended organization:
- login boleh diarahkan ke billing/support screen,
- write operasional dapat dibatasi,
- data tidak dihapus.

Cancellation tidak sama dengan deletion.

---

## 17. Data Deletion & Retention

Karena data anak dan data akademik sensitif:

- hard delete bukan operasi user biasa,
- record akademik penting menggunakan archive/soft-delete,
- audit log tidak boleh ikut soft-delete bersama entity,
- retention policy final harus disesuaikan dengan kebutuhan hukum/kontrak sekolah sebelum production.

PRD menyebut kepatuhan UU PDP dan retention policy sebagai requirement; detail legal final belum didefinisikan di PRD dan membutuhkan review khusus sebelum launch komersial.

---

## 18. Scaling Path

### Stage A — Core / Pilot

```text
Supabase PostgreSQL
shared DB
shared schema
organization_id + school_id
RLS
```

### Stage B — Growth

```text
larger compute
connection pooling
indexes
partition high-volume tables
read replicas for reporting
```

### Stage C — Enterprise exception

Customer tertentu dapat dipindah ke:
- schema dedicated, atau
- database dedicated.

Domain IDs dan tenant abstraction harus dipertahankan sehingga business layer tidak bergantung pada satu deployment topology.

---

## 19. Anti-Patterns yang Dilarang

### `tenant_id = school_id`
Dilarang karena menyulitkan multi-school yayasan.

### role tunggal pada user

```text
users.role = 'teacher'
```

Dilarang.

### filter tenant hanya di frontend
Dilarang.

### service role key di browser
Dilarang.

### Parent mendapat role Teacher-like untuk melihat child
Dilarang; gunakan relationship scope.

### semua query memakai `activeSchoolId` client tanpa authorization
Dilarang.

---

## 20. Definition of Done

Tenant architecture dianggap siap ketika:

- Organization ditetapkan sebagai tenant boundary,
- School sebagai operational boundary,
- setiap entity sudah dikategorikan org-scoped atau school-scoped,
- Membership mendukung multi-role dan multi-school,
- scope model disepakati,
- Parent menggunakan RELATED access,
- RLS menjadi layer wajib,
- platform admin dipisahkan dari tenant role,
- scaling path tidak membutuhkan rewrite model domain.
