# EduSmart — Product Domain Model

**Versi:** 1.0  
**Status:** Foundation Architecture — Locked for Core MVP design  
**Sumber utama:** `PRD_EduSmart_School_Management_System.md`  
**Cakupan:** Core EduSmart sampai SIS, Teacher Assignment, Schedule, Attendance, Assessment, Parent Portal, dan Reporting.

---

## 1. Tujuan Dokumen

Dokumen ini menerjemahkan PRD EduSmart dari daftar modul menjadi **model domain produk** yang dapat dijadikan sumber kebenaran bersama untuk desain database, RBAC, API, UI, migration, dan implementasi Supabase/Lovable.

PRD menetapkan EduSmart sebagai *School Operating System* multi-tenant dengan SIS sebagai fondasi, diikuti Academic Management, Parent & Student Portal, serta Auth/Role Management. Dokumen ini mempertahankan arah tersebut dan menetapkan struktur domain yang lebih presisi agar implementasi tidak berkembang secara ad-hoc.

---

## 2. Keputusan Arsitektur Utama

### 2.1 Tenant bukan School

**Keputusan:** `Tenant = Organization`.

Organization merepresentasikan pemilik/operator data, misalnya yayasan, lembaga pendidikan, atau operator sekolah tunggal. Sebuah Organization memiliki satu atau lebih School.

```text
Organization / Tenant
├── School A
├── School B
└── School C
```

Alasan:
- Mendukung sekolah tunggal tanpa overhead berarti.
- Mendukung yayasan multi-school tanpa migrasi fundamental.
- Memungkinkan dashboard lintas sekolah di masa depan.
- Memberi boundary keamanan dan billing SaaS yang jelas.

### 2.2 School adalah unit operasional utama

Sebagian besar operasi akademik terjadi dalam scope School:
- tahun ajaran,
- kelas,
- siswa,
- guru,
- jadwal,
- presensi,
- penilaian,
- rapor.

### 2.3 User tidak identik dengan role

Satu user dapat memiliki beberapa membership dan beberapa role.

Contoh:

```text
User: Budi
├── School A → Teacher
├── School A → Homeroom Teacher
└── School B → Curriculum Vice Principal
```

Karena itu role tidak disimpan sebagai satu field `users.role`.

### 2.4 Student, Guardian, dan Staff adalah domain record

Akun login adalah identitas digital. Siswa, wali, dan staf adalah entitas bisnis.

- Student boleh belum memiliki akun.
- Guardian boleh belum memiliki akun.
- Staff dapat memiliki akun sejak awal.
- Satu akun Guardian dapat terkait dengan banyak Student.
- Satu Student dapat memiliki banyak Guardian.

### 2.5 Enrollment dipisahkan dari Student

`Student` adalah identitas murid jangka panjang. Status kelas/tahun ajaran berada pada `Student Enrollment` dan `Class Enrollment`.

Ini penting agar riwayat:
- naik kelas,
- pindah kelas,
- mutasi,
- lulus,
- aktif/nonaktif,

tidak mengubah histori lama.

---

## 3. Bounded Context / Domain Utama

### 3.1 Organization & Identity

Menjawab:
- siapa tenant,
- sekolah apa yang berada di tenant,
- siapa user,
- user memiliki akses ke sekolah mana,
- role dan permission apa yang dimiliki.

Entitas utama:
- Organization
- School
- Profile
- Membership
- Role
- Permission
- MembershipRole
- Invitation

### 3.2 Academic Foundation

Menjawab struktur akademik yang menjadi referensi domain lain.

Entitas utama:
- AcademicYear
- Term
- GradeLevel
- Classroom
- Subject
- Curriculum
- LearningOutcome
- LearningObjective

### 3.3 Student Information System (SIS)

Menjawab siapa siswa, wali, guru/staff, dan status akademiknya.

Entitas utama:
- Student
- Guardian
- StudentGuardian
- StaffMember
- StudentEnrollment
- ClassEnrollment

### 3.4 Teaching & Scheduling

Menjawab siapa mengajar apa, di kelas mana, dan kapan.

Entitas utama:
- TeachingAssignment
- TimetableEntry
- AcademicCalendarEvent

### 3.5 Attendance

Menjawab kehadiran siswa dan guru berdasarkan hari/sesi.

Entitas utama:
- AttendanceSession
- StudentAttendanceRecord
- StaffAttendanceRecord
- AttendanceChangeLog

### 3.6 Assessment

Menjawab aktivitas evaluasi dan nilai siswa.

Entitas utama:
- AssessmentType
- Assessment
- AssessmentLearningObjective
- StudentScore

### 3.7 Reporting

Menjawab agregasi nilai dan publikasi rapor.

Entitas utama:
- ReportCard
- ReportCardSubjectEntry
- ReportCardNarrative
- GeneratedDocument

### 3.8 Parent Portal

Parent Portal bukan sumber data baru yang menduplikasi domain lain. Portal adalah **experience layer** yang membaca data anak berdasarkan relasi Guardian ↔ Student.

Data utama berasal dari:
- StudentGuardian,
- StudentEnrollment,
- Attendance,
- Schedule,
- Assessment,
- ReportCard.

### 3.9 System & Audit

Menjawab kebutuhan auditability dan keamanan.

Entitas utama:
- AuditLog
- FileAsset
- DomainEvent / OutboxEvent (fase hardening)

---

## 4. Dependency Map

```text
Organization & Identity
        │
        ├───────────────┐
        ▼               ▼
Academic Foundation    SIS
        │               │
        └───────┬───────┘
                ▼
       Teaching Assignment
                │
                ▼
            Schedule
                │
       ┌────────┴────────┐
       ▼                 ▼
   Attendance         Assessment
       │                 │
       └────────┬────────┘
                ▼
             Reporting
                │
                ▼
          Parent Portal
```

Implikasi:
- Attendance tidak boleh dibangun sebelum Enrollment dan Schedule stabil.
- Assessment tidak boleh bergantung langsung pada nama siswa/kelas yang disalin.
- Parent Portal tidak menyimpan salinan nilai atau presensi.
- Reporting adalah hasil dari data akademik terstruktur, bukan tabel nilai manual terpisah.

---

## 5. Aggregate Roots dan Ownership

### Organization
Aggregate root untuk tenant.

Memiliki:
- schools,
- organization memberships,
- tenant settings.

### School
Aggregate root operasional sekolah.

Memiliki:
- academic years,
- grade levels,
- subjects,
- school settings.

### Student
Aggregate root identitas murid pada level Organization.

Student tidak dimiliki permanen oleh satu School. Hubungan siswa ke School berada pada `StudentEnrollment`. Ini memungkinkan satu identitas siswa melanjutkan dari SD → SMP dalam yayasan yang sama tanpa duplikasi identitas. Student juga tidak menyimpan kelas aktif langsung sebagai source of truth; kelas aktif diperoleh dari enrollment.

### StaffMember
Aggregate root identitas personel pada level Organization. Hubungan kerja/penempatan ke School berada pada `StaffSchoolAssignment`, sehingga satu personel dapat aktif pada lebih dari satu School.

### StaffSchoolAssignment
Aggregate root penempatan StaffMember pada satu School beserta nomor pegawai/status kerja lokal.

### StudentEnrollment
Aggregate root perjalanan siswa pada satu school + academic year.

### Classroom
Aggregate root rombongan belajar.

### TeachingAssignment
Aggregate root relasi:

```text
Teacher + Subject + Classroom + AcademicYear (+ Term)
```

### AttendanceSession
Aggregate root untuk satu sesi presensi.

### Assessment
Aggregate root untuk satu aktivitas evaluasi.

### ReportCard
Aggregate root untuk rapor satu siswa pada satu term.

---

## 6. Core Entity Relationship

```text
Organization
  1 ─── * School
  1 ─── * Membership

School
  1 ─── * AcademicYear
  1 ─── * GradeLevel
  1 ─── * Classroom
  1 ─── * Subject
  1 ─── * StudentEnrollment
  1 ─── * StaffSchoolAssignment

Organization
  1 ─── * Student
  1 ─── * Guardian
  1 ─── * StaffMember

Student
  1 ─── * StudentEnrollment
  * ─── * Guardian

StudentEnrollment
  1 ─── * ClassEnrollment

Classroom
  1 ─── * ClassEnrollment
  1 ─── * TeachingAssignment

StaffMember
  1 ─── * StaffSchoolAssignment

StaffSchoolAssignment
  1 ─── * TeachingAssignment

Subject
  1 ─── * TeachingAssignment

TeachingAssignment
  1 ─── * TimetableEntry
  1 ─── * Assessment

TimetableEntry
  1 ─── * AttendanceSession

AttendanceSession
  1 ─── * StudentAttendanceRecord

Assessment
  1 ─── * StudentScore

StudentEnrollment + Term
  1 ─── 0..1 ReportCard
```

---

## 7. Student Lifecycle

```text
Prospect / PPDB                  [future domain]
        │ accepted
        ▼
Student Created
        │
        ▼
Student Enrollment
        │
        ├── Active
        ├── Leave
        ├── Transferred
        ├── Withdrawn
        └── Graduated
```

Setiap tahun ajaran baru:

```text
Existing Student
      │
      ▼
New StudentEnrollment
      │
      ▼
ClassEnrollment
```

Histori tahun sebelumnya tidak ditimpa.

---

## 8. Domain Invariants

Aturan berikut dianggap **non-negotiable** untuk Core V1.

### Tenant isolation
1. Semua data tenant-scoped memiliki `organization_id`.
2. Data school-scoped juga memiliki `school_id`.
3. Record yang direferensikan harus berasal dari organization yang sama.
4. Cross-tenant relationship dilarang di database dan service layer.

### Academic
5. AcademicYear hanya dimiliki satu School.
6. Term harus berada di dalam rentang AcademicYear.
7. Classroom harus terikat ke satu AcademicYear dan satu GradeLevel.
8. Siswa tidak boleh memiliki dua StudentEnrollment aktif untuk school + academic year yang sama.
9. ClassEnrollment aktif siswa pada tanggal yang sama hanya boleh satu sebagai kelas utama.
10. TeachingAssignment harus menggunakan StaffMember, Classroom, dan Subject dari School yang sama.

### Schedule
11. Guru tidak boleh memiliki dua jadwal overlap pada waktu yang sama.
12. Classroom tidak boleh memiliki dua jadwal overlap pada waktu yang sama.
13. TimetableEntry yang telah dipakai Attendance tidak boleh hard delete; perubahan menggunakan revision/disable.

### Attendance
14. Satu siswa hanya memiliki satu attendance record per attendance session.
15. Attendance record hanya boleh dibuat untuk siswa yang valid pada class/enrollment saat tanggal session.
16. Perubahan presensi setelah session dikunci harus tercatat pada audit log.

### Assessment
17. Score harus mengacu ke Assessment dan StudentEnrollment yang kompatibel dengan class.
18. Nilai tidak boleh melebihi `max_score` atau di bawah `min_score`.
19. Assessment yang sudah dipublish tidak boleh dihapus; hanya void/archive dengan audit trail.

### Reporting
20. ReportCard hanya satu per student enrollment + term + version aktif.
21. Publish report card memerlukan status valid dan permission khusus.
22. Published report harus tetap dapat direproduksi secara historis.

### Guardian
23. Parent Portal hanya boleh membaca Student yang memiliki relasi Guardian aktif.
24. Relasi wali harus memiliki tipe hubungan dan status akses.

---

## 9. State Machines Inti

### Student Enrollment

```text
DRAFT
  → ACTIVE
  → LEAVE
  → TRANSFERRED
  → WITHDRAWN
  → GRADUATED
```

### Assessment

```text
DRAFT
  → OPEN
  → CLOSED
  → PUBLISHED
  → ARCHIVED
```

### Report Card

```text
DRAFT
  → SUBMITTED
  → REVIEWED
  → PUBLISHED
  → REVISED
  → ARCHIVED
```

### Attendance Session

```text
OPEN
  → SUBMITTED
  → LOCKED
  → CORRECTED
```

---

## 10. Domain Events Penting

Tidak semua harus diimplementasikan sebagai event bus pada Lovable MVP, tetapi nama event harus dipakai konsisten agar mudah diekstrak kemudian.

- `student.created`
- `student.enrolled`
- `student.class_changed`
- `student.withdrawn`
- `teaching_assignment.created`
- `schedule.published`
- `attendance.submitted`
- `attendance.corrected`
- `assessment.created`
- `assessment.published`
- `score.updated`
- `report_card.submitted`
- `report_card.published`
- `membership.invited`
- `membership.role_changed`

---

## 11. Core V1 — In Scope

### Foundation
- Organization
- School
- User Profile
- Membership
- RBAC
- Academic Year
- Term
- Grade Level
- Classroom
- Subject

### SIS
- Student CRUD
- Guardian CRUD
- Guardian ↔ Student relationship
- Staff/Teacher CRUD
- Student enrollment
- Class history
- Import/export design-ready

### Academic Operations
- Teacher assignment
- Weekly timetable
- conflict validation
- Attendance
- Assessment
- Score entry
- Report card basic

### Parent Portal
- multi-child selection
- attendance read
- schedule read
- assessment/score read based on publication rules
- report card read/download

---

## 12. Explicitly Out of Scope for Core V1

Walaupun terdapat di PRD besar, berikut tidak dimasukkan ke foundation build pertama:

- Finance & Billing
- PPDB & CRM
- WhatsApp Communication Center
- AI Assistant
- LMS
- Inventory/Sarpras
- Library
- UKS
- Tahfidz
- HR/Payroll lengkap
- Dinas Dashboard
- advanced BI
- native mobile app

Model domain tidak boleh membuat fitur-fitur tersebut mustahil ditambahkan, tetapi tidak boleh menambah tabel spekulatif hanya untuk mengakomodasi semuanya sekarang.

---

## 13. Ubiquitous Language / Glossary

| Istilah | Definisi resmi EduSmart |
|---|---|
| Organization | Tenant SaaS; yayasan/lembaga/operator sekolah |
| School | Unit sekolah operasional di bawah Organization |
| Academic Year | Tahun ajaran milik School |
| Term | Semester/periode di dalam Academic Year |
| Grade Level | Tingkat/jenjang kelas, mis. 1, 2, 7, 10 |
| Classroom | Rombongan belajar aktual, mis. 7A |
| Student | Identitas murid jangka panjang |
| Student Enrollment | Status siswa dalam satu school + academic year |
| Class Enrollment | Penempatan StudentEnrollment ke Classroom dalam periode tertentu |
| Guardian | Orang tua/wali siswa |
| Staff Member | Identitas personel pada level Organization; guru maupun non-guru |
| Staff School Assignment | Penempatan StaffMember pada School tertentu |
| Teaching Assignment | Penugasan guru untuk mengajar subject pada classroom |
| Timetable Entry | Slot jadwal berulang |
| Attendance Session | Sesi presensi aktual pada tanggal tertentu |
| Assessment | Aktivitas penilaian |
| Student Score | Nilai siswa untuk satu assessment |
| Report Card | Dokumen rapor siswa per term |
| Membership | Hak seorang profile untuk berada dalam organization/school |
| Role | Kumpulan permission |
| Permission | Hak melakukan action tertentu |
| Scope | Batas data yang boleh diakses: org, school, class, own, related |

---

## 14. Definition of Done untuk Domain Model

Domain model dianggap siap dipakai implementasi ketika:

- tenant boundary telah disepakati,
- relationship Student/Guardian/Staff jelas,
- enrollment tidak menimpa history,
- semua academic operations menggunakan AcademicYear dan School secara eksplisit,
- role dipisahkan dari user,
- Parent Portal membaca domain data tanpa duplikasi,
- state machine utama disepakati,
- ERD dapat dibuat tanpa ambigu besar.

Dokumen berikut yang bergantung langsung pada model ini:

1. `02_TENANT_ARCHITECTURE.md`
2. `03_DATABASE_ERD.md`
3. `04_RBAC_PERMISSION_MATRIX.md`
4. `05_AUTHENTICATION_ARCHITECTURE.md`
5. `06_ACADEMIC_STRUCTURE.md`
