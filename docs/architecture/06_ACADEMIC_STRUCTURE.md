# EduSmart — Academic Structure

**Versi:** 1.0  
**Status:** Core Academic Domain Specification  
**Scope:** School setup, academic year, term, grade, class, subject, enrollment, teaching assignment, timetable, assessment foundation, report lifecycle

---

## 1. Tujuan

Dokumen ini menetapkan bahasa dan aturan akademik agar SIS, Schedule, Attendance, Assessment, Parent Portal, dan Reporting menggunakan struktur yang sama.

PRD menyebut kebutuhan jadwal, presensi, nilai, rapor, jurnal mengajar, Kurikulum Merdeka, parent/student portal, serta kesiapan multi-unit TK–SMA. Namun detail structure belum didefinisikan. Dokumen ini menetapkan model generik yang kompatibel dengan sekolah Indonesia tanpa mengunci sistem hanya pada satu jenjang.

---

## 2. Academic Hierarchy

```text
Organization
  ↓
School
  ↓
Academic Year
  ↓
Term

School
  ↓
Grade Level

Academic Year + Grade Level
  ↓
Classroom

School
  ↓
Subject

Classroom + Subject + Teacher
  ↓
Teaching Assignment
```

---

## 3. School vs Education Stage

Satu `School` adalah unit operasional.

Field `education_stage` dapat berupa:

```text
PAUD
TK
SD
SMP
SMA
SMK
OTHER
```

Core data model tidak mengasumsikan setiap school memiliki grade 1–12 sekaligus.

Contoh yayasan:

```text
Organization: Yayasan ABC
├── ABC TK
├── ABC SD
├── ABC SMP
└── ABC SMA
```

Masing-masing adalah School terpisah.

Ini paling sesuai untuk:
- academic year independent,
- staff assignment,
- reporting,
- billing future,
- permission boundary.

---

## 4. Academic Year

Academic Year milik satu School.

Contoh:

```text
2026/2027
starts_on: 2026-07-13
ends_on:   2027-06-30
```

Status:

```text
DRAFT
ACTIVE
CLOSED
ARCHIVED
```

### Rules

1. Hanya satu AcademicYear `ACTIVE` per School pada Core V1.
2. Future year dapat disiapkan sebagai DRAFT.
3. Closed year tidak menerima perubahan operasional biasa.
4. Koreksi historis harus elevated permission + audit.
5. Data lama tidak dipindahkan ke current year; setiap year memiliki enrollment baru.

---

## 5. Term / Semester

Term berada di dalam AcademicYear.

Default Indonesia:

```text
Semester 1
Semester 2
```

Tetapi data model mendukung lebih dari dua term bila sekolah memakai trimester atau period internal.

Fields penting:
- code,
- name,
- sequence,
- start/end date,
- status.

Rule:
- term tidak boleh keluar dari date range AcademicYear.

---

## 6. Grade Level

Grade Level adalah **tingkat**, bukan kelas rombel.

Contoh:

```text
Grade Level: Kelas 7
Classroom: 7A, 7B, 7C
```

Grade level menggunakan `sequence` untuk progression.

Contoh SMP:

| code | display | sequence |
|---|---|---:|
| G7 | Kelas 7 | 1 |
| G8 | Kelas 8 | 2 |
| G9 | Kelas 9 | 3 |

Tidak hardcode bahwa `sequence=1` berarti Kelas 1 SD.

---

## 7. Classroom / Rombel

Classroom adalah rombongan belajar dalam AcademicYear.

Contoh:

```text
Academic Year: 2026/2027
Grade: 7
Classrooms:
- 7A
- 7B
- 7C
```

Fields:
- academic_year,
- grade_level,
- code,
- name,
- capacity,
- homeroom teacher,
- status.

Classroom tahun berikutnya adalah entity baru.

`7A 2026/2027` ≠ `7A 2027/2028`.

---

## 8. Student Enrollment

Siswa tidak ditempel permanen ke School maupun Classroom. Identitas Student berada di Organization; affiliation ke School terjadi melalui StudentEnrollment.

```text
Student (Organization identity)
  ↓
StudentEnrollment (School + AcademicYear)
  ↓
ClassEnrollment
```

### StudentEnrollment
Menjawab:

> Apakah siswa ini terdaftar pada School + AcademicYear ini, dan pada GradeLevel apa?

### ClassEnrollment
Menjawab:

> Pada periode tanggal ini siswa berada di Classroom mana?

Ini mendukung pindah rombel di tengah tahun.

Contoh:

```text
Student: Ali
Academic Year 2026/2027
Grade Level: 7

Class Enrollment 1
7A, Jul–Dec

Class Enrollment 2
7B, Jan–Jun
```

Attendance/report historical tetap dapat direkonstruksi.

---

## 9. Promotion / Naik Kelas

Naik kelas tidak mengubah old enrollment.

Flow:

```text
Close 2026/2027 enrollment
       ↓
Promotion Decision
       ↓
Create 2027/2028 enrollment
       ↓
Assign Grade Level
       ↓
Assign Classroom
```

Outcomes:

```text
PROMOTED
RETAINED
GRADUATED
TRANSFERRED_OUT
WITHDRAWN
```

Promotion workflow UI dapat dibuat setelah Core V1, tetapi schema harus mendukungnya sejak awal melalui annual enrollment.

---

## 10. Subject Model

Subject dimiliki School.

Contoh:
- Mathematics
- Bahasa Indonesia
- IPA
- PAI

Subject bukan TeachingAssignment.

```text
Subject = "Mathematics"
TeachingAssignment = "Bu Rina teaches Mathematics to 7A in AY 2026/2027"
```

Satu subject dapat digunakan banyak grade/class.

Jika sekolah membutuhkan subject berbeda per grade, gunakan mapping curriculum/learning outcome, bukan menduplikasi nama subject tanpa alasan.

---

## 11. Curriculum Model

PRD menyebut Kurikulum Merdeka / capaian pembelajaran.

Untuk menghindari over-engineering, gunakan dua layer.

### Core V1 minimum

```text
Curriculum
Subject
Grade Level
```

### Curriculum-aware extension

```text
Curriculum
  ↓
Learning Outcome (CP)
  ↓
Learning Objective (TP)
```

Assessment dapat ditautkan ke satu atau lebih LearningObjective.

Model tidak mengasumsikan semua assessment harus memiliki TP pada pilot pertama.

---

## 12. Teaching Assignment

TeachingAssignment adalah hubungan resmi:

```text
StaffSchoolAssignment (Teacher in this School)
+ Subject
+ Classroom
+ Academic Year
(+ Term / effective dates)
```

Contoh:

```text
Staff: Rina
School Assignment: Teacher at this School
Subject: Mathematics
Classroom: 7A
Academic Year: 2026/2027
```

Assignment menjadi dasar untuk:
- schedule,
- teacher dashboard,
- attendance rights,
- assessment rights,
- scope RBAC.

Jangan menentukan hak teacher hanya dari role `Teacher`; hak kelas berasal dari active assignment.

---

## 13. Homeroom Teacher

Homeroom berbeda dengan subject teaching assignment.

Homeroom teacher memiliki responsibility pada satu Classroom, misalnya:
- attendance oversight,
- class summary,
- parent-facing coordination,
- report narrative.

Implementation options:
- `classrooms.homeroom_staff_school_assignment_id` sebagai source assignment sederhana Core V1,
- plus synchronized authorization grant `HomeroomTeacher + CLASS scope`.

Jika nanti satu class memiliki co-homeroom, ubah menjadi junction table `classroom_staff_roles` yang mengacu ke StaffSchoolAssignment.

---

## 14. Timetable Structure

Timetable Entry adalah jadwal berulang.

```text
Monday
08:00–09:20
7A
Mathematics
Bu Rina
```

Timetable mengacu ke TeachingAssignment, bukan menyimpan text teacher/subject manual.

### Required validations

1. teacher overlap,
2. classroom overlap,
3. start < end,
4. effective date within academic year,
5. assignment active,
6. optional room conflict future.

### Publishing

Schedule state:

```text
DRAFT
PUBLISHED
INACTIVE
```

Parent/student hanya melihat published schedule.

---

## 15. Calendar Exceptions

Weekly timetable tidak cukup untuk real operations.

Academic calendar harus bisa menyatakan:
- holiday,
- exam week,
- school event,
- teacher training,
- special schedule day.

Core V1 minimal menyimpan calendar event dan memungkinkan attendance session dibuat manual/skip ketika instruction tidak berlangsung.

Advanced timetable override dapat dibuat setelah pilot.

---

## 16. Attendance Academic Rule

AttendanceSession adalah occurrence nyata, bukan weekly template.

```text
TimetableEntry
  ↓ date 2026-08-17
AttendanceSession
  ↓
StudentAttendanceRecords
```

### Student eligibility

Siswa muncul di roster session jika:
- StudentEnrollment active,
- ClassEnrollment mencakup session date,
- Classroom cocok.

### Status default

```text
PRESENT
LATE
EXCUSED
SICK
ABSENT
OTHER
```

Exact school labels dapat dikonfigurasi kemudian, tetapi internal canonical statuses harus stabil untuk analytics.

---

## 17. Teacher Attendance

PRD meminta presensi siswa & guru.

Core V1 memisahkan teacher/staff daily attendance dari class attendance.

Teacher attendance menjawab:
- hadir kerja,
- terlambat,
- izin,
- sakit,
- absent.

Teacher presence dalam teaching session dapat ditambahkan kemudian jika sekolah membutuhkan lesson-specific check-in.

---

## 18. Assessment Structure

Assessment wajib terkait:

```text
School
Academic Year
Term
Teaching Assignment
Assessment Type
```

Contoh:

```text
Mathematics 7A
Quiz: Persamaan Linear
Max Score: 100
Weight: optional
```

StudentScore mengacu StudentEnrollment.

---

## 19. Assessment Types

School-configurable:

```text
Assignment
Quiz
Daily Test
Project
Midterm
Final
Performance
Other
```

Internal code tidak boleh bergantung pada label Bahasa Indonesia agar localization mudah.

Weighting strategy belum dikunci secara universal karena setiap sekolah dapat memiliki policy berbeda.

Core V1 harus mendukung:
- raw score,
- optional weight,
- type/category.

Formula final grade dibuat configurable di Reporting layer setelah pilot rule tersedia.

---

## 20. Kurikulum Merdeka Compatibility

PRD menyebut capaian pembelajaran. Model disiapkan untuk:

```text
Assessment
  * ─── * LearningObjective
```

Sehingga pada future report:
- numeric score dapat disertai mastery,
- narrative dapat dihasilkan dari objectives.

Namun Core V1 tidak boleh memaksa guru mengisi CP/TP untuk setiap assessment jika sekolah pilot belum siap.

---

## 21. Score Lifecycle

Assessment:

```text
DRAFT
  ↓
OPEN
  ↓
CLOSED
  ↓
PUBLISHED
```

Student score:

```text
MISSING
SUBMITTED
EXCUSED
FINAL
```

Parent/student visibility hanya ketika policy publikasi mengizinkan.

---

## 22. Report Card Structure

Rapor berada pada:

```text
StudentEnrollment
+ Term
```

Flow:

```text
Generate Draft
  ↓
Teacher/Homeroom Complete
  ↓
Submit
  ↓
Review
  ↓
Publish
  ↓
Parent/Student Visible
```

### Published Snapshot

Saat publish, report card menyimpan snapshot subject result/narrative.

Alasan:
- formula assessment dapat berubah,
- score dapat dikoreksi dengan workflow,
- published historical report harus reproducible.

---

## 23. Report Calculation Boundary

Jangan menghitung semua final score hanya di frontend.

Gunakan trusted calculation layer sehingga:
- formula konsisten,
- audit dapat merekam calculation metadata,
- regenerate deterministic,
- parent tidak dapat memanipulasi result.

Formula grading exact belum didefinisikan PRD dan harus dikunci berdasarkan sekolah pilot.

---

## 24. Academic Year Closing

Saat AcademicYear ditutup:

- schedule menjadi historical,
- attendance normal write ditutup,
- assessment normal write ditutup,
- report harus sudah publish/review sesuai policy,
- enrollment memiliki final status,
- correction memerlukan elevated permission.

Closing bukan hard lock tanpa exception; exception wajib audited.

---

## 25. Parent Portal Mapping

Parent melihat data melalui child context:

```text
Child
  ↓
Current Enrollment
  ├── Current Classroom
  ├── Published Schedule
  ├── Attendance
  ├── Published Assessment/Score
  └── Published Report Card
```

Tidak menampilkan draft assessment atau draft report.

---

## 26. Teacher Dashboard Mapping

Teacher dashboard dapat dibangun dari:

```text
TeachingAssignments
  ↓
Today's TimetableEntries
  ↓
Attendance Sessions
  ↓
Assessments needing action
```

Tidak perlu duplicate dashboard tables pada awal.

---

## 27. Principal Dashboard Mapping

Core operational summary:
- teacher attendance,
- student attendance,
- open/missing attendance sessions,
- schedule conflicts,
- report card workflow status.

Untuk pilot kecil, agregasi dapat query transactional DB dengan indexed query. Saat skala besar, gunakan summary/materialized tables.

---

## 28. Edge Cases yang Sudah Diakomodasi

### Student pindah kelas di tengah semester
ClassEnrollment history.

### Teacher diganti sementara
TeachingAssignment effective dates / new assignment.

### Satu subject diajar dua guru
Multiple TeachingAssignment roles teacher/assistant.

### Parent memiliki dua anak
StudentGuardian many-to-many.

### Parent anak di school berbeda
Relationship + tenant/school context.

### Siswa mengulang kelas
New annual StudentEnrollment dapat menunjuk grade level yang sama.

### Siswa lulus
Enrollment status GRADUATED; student identity retained.

### Jadwal berubah pertengahan term
New timetable effective range; old entries retained/inactive.

---

## 29. Keputusan yang Sengaja Ditunda sampai Pilot

Belum boleh dipaksakan menjadi hardcoded rule:

- formula nilai akhir,
- bobot assessment per school,
- format rapor resmi tiap jenjang,
- detailed CP/TP workflow,
- remedial policy,
- ekstrakurikuler grade,
- behavior/character scoring,
- attendance threshold rules,
- kenaikan kelas automation.

Semua ini membutuhkan rule nyata dari sekolah pilot.

---

## 30. Build Order Academic Core

Setelah schema foundation:

```text
1. Academic Year
2. Term
3. Grade Level
4. Classroom
5. Subject
6. Student Enrollment
7. Class Enrollment
8. Staff / Teacher
9. Teaching Assignment
10. Timetable
11. Attendance
12. Assessment
13. Report Card
14. Parent read experience
```

Urutan ini sebaiknya diikuti Lovable/Codex agar dependency tidak dibangun terbalik.

---

## 31. Academic Acceptance Criteria

Struktur dianggap siap untuk implementation jika sistem secara konseptual dapat menjawab dengan satu sumber data:

- "Siapa siswa aktif 7A hari ini?"
- "Guru siapa yang mengajar Matematika 7A Senin 08:00?"
- "Siswa mana yang absent pada sesi tersebut?"
- "Nilai Quiz X milik Ali berapa?"
- "Rapor Semester 1 Ali sudah publish atau belum?"
- "Anak mana saja yang boleh dilihat parent ini?"
- "Bagaimana histori kelas siswa sebelum pindah rombel?"
- "Siapa yang mengubah nilai/presensi dan kapan?"

Jika jawaban memerlukan duplicate manual data di beberapa tabel, desain harus diperbaiki sebelum coding.
