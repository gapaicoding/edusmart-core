# EduSmart — RBAC & Permission Matrix

**Versi:** 1.0  
**Status:** Foundation Authorization Model  
**Scope:** Core MVP roles + extensible mapping untuk persona PRD

---

## 1. Prinsip

EduSmart menggunakan:

```text
User
  ↓
Membership
  ↓
Role(s)
  ↓
Permission(s)
  ↓
Scope
```

Bukan:

```text
users.role = 'teacher'
```

### Formula authorization

```text
ALLOW = authenticated
    AND membership_active
    AND permission_granted
    AND scope_matches_resource
    AND domain_constraints_pass
```

RBAC tidak menggantikan RLS. RBAC menentukan hak; RLS menegakkan data boundary di database.

---

## 2. Scope Codes

| Code | Meaning |
|---|---|
| `PLATFORM` | Internal EduSmart, seluruh tenant |
| `ORG` | Seluruh Organization |
| `SCHOOL` | School tertentu |
| `CLASS` | Classroom yang ditugaskan |
| `OWN` | Record user sendiri |
| `RELATED` | Record dengan relasi eksplisit, mis. Guardian → Child |

Cell matrix menggunakan format:

```text
✓ S = allowed at SCHOOL scope
✓ C = allowed at CLASS scope
✓ O = allowed at ORGANIZATION scope
✓ R = allowed at RELATED scope
✓ W = allowed at OWN scope
—   = denied by default
A   = approval / elevated permission required
```

---

## 3. Default Roles Core V1

### Organization Owner / Yayasan Admin
Scope default: `ORG`.

### School Admin / Tata Usaha Admin
Scope default: `SCHOOL`.

### Principal / Kepala Sekolah
Scope default: `SCHOOL`.

### Curriculum Vice Principal
Scope default: `SCHOOL`.

### Teacher
Scope default: `CLASS` berdasarkan TeachingAssignment.

### Homeroom Teacher
Scope default: `CLASS` berdasarkan homeroom Classroom.

### Parent / Guardian
Scope default: `RELATED`.

### Student
Scope default: `OWN`.

### Platform Super Admin
Internal EduSmart only, tidak diberikan tenant lewat UI.

---

## 4. Permission Registry — Naming Convention

```text
<resource>.<action>
```

Contoh:
- `student.read`
- `student.create`
- `student.update`
- `student.archive`
- `student.export`
- `attendance.submit`
- `assessment.publish`
- `report_card.publish`

Action umum:

```text
read
create
update
archive
manage
import
export
submit
approve
publish
reopen
```

---

# 5. Foundation & Organization Matrix

| Permission | Org Owner | School Admin | Principal | Vice Principal | Teacher | Homeroom | Parent | Student |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| organization.read | ✓ O | ✓ S* | ✓ S* | ✓ S* | ✓ S* | ✓ S* | — | — |
| organization.update | ✓ O | — | — | — | — | — | — | — |
| school.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ S | ✓ S | ✓ R* | ✓ W* |
| school.update | ✓ O | A S | A S | — | — | — | — | — |
| membership.read | ✓ O | ✓ S | ✓ S | — | — | — | — | — |
| membership.invite | ✓ O | ✓ S | A S | — | — | — | — | — |
| membership.update_role | ✓ O | A S | — | — | — | — | — | — |
| membership.disable | ✓ O | A S | — | — | — | — | — | — |
| role.read | ✓ O | ✓ S | ✓ S | ✓ S | — | — | — | — |
| role.manage_custom | ✓ O | A S | — | — | — | — | — | — |

`S*`, `R*`, `W*` berarti metadata terbatas yang diperlukan untuk pengalaman user, bukan seluruh administrative data.

---

# 6. Academic Setup Matrix

| Permission | Org Owner | School Admin | Principal | Vice Principal | Teacher | Homeroom | Parent | Student |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| academic_year.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ S | ✓ S | ✓ R | ✓ W |
| academic_year.manage | ✓ O | ✓ S | A S | ✓ S | — | — | — | — |
| term.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ S | ✓ S | ✓ R | ✓ W |
| term.manage | ✓ O | ✓ S | A S | ✓ S | — | — | — | — |
| grade_level.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ S | ✓ S | ✓ R | ✓ W |
| grade_level.manage | ✓ O | ✓ S | A S | ✓ S | — | — | — | — |
| classroom.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | ✓ R | ✓ W |
| classroom.manage | ✓ O | ✓ S | A S | ✓ S | — | — | — | — |
| subject.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ S | ✓ S | ✓ R | ✓ W |
| subject.manage | ✓ O | ✓ S | A S | ✓ S | — | — | — | — |
| curriculum.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | — | ✓ W* |
| curriculum.manage | ✓ O | A S | A S | ✓ S | — | — | — | — |

---

# 7. SIS Matrix

| Permission | Org Owner | School Admin | Principal | Vice Principal | Teacher | Homeroom | Parent | Student |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| student.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | ✓ R | ✓ W |
| student.create | ✓ O | ✓ S | — | — | — | — | — | — |
| student.update | ✓ O | ✓ S | A S | — | — | A C* | — | — |
| student.archive | ✓ O | A S | A S | — | — | — | — | — |
| student.import | ✓ O | ✓ S | — | — | — | — | — | — |
| student.export | ✓ O | ✓ S | ✓ S | ✓ S | — | ✓ C | — | — |
| guardian.read | ✓ O | ✓ S | ✓ S | — | — | ✓ C | ✓ R | — |
| guardian.manage | ✓ O | ✓ S | — | — | — | — | A R* | — |
| staff.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ S* | ✓ S* | — | — |
| staff.create | ✓ O | ✓ S | — | — | — | — | — | — |
| staff.update | ✓ O | ✓ S | A S | — | A W* | A W* | — | — |
| enrollment.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | ✓ R | ✓ W |
| enrollment.manage | ✓ O | ✓ S | A S | A S | — | — | — | — |
| class_enrollment.manage | ✓ O | ✓ S | A S | ✓ S | — | A C | — | — |

`A C*` untuk Homeroom hanya field non-master tertentu jika sekolah mengaktifkan workflow koreksi data; default production dapat dibuat read-only.

---

# 8. Teacher Assignment Matrix

| Permission | Org Owner | School Admin | Principal | Vice Principal | Teacher | Homeroom | Parent | Student |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| teaching_assignment.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ W/C | ✓ C | ✓ R* | ✓ W* |
| teaching_assignment.create | ✓ O | ✓ S | A S | ✓ S | — | — | — | — |
| teaching_assignment.update | ✓ O | ✓ S | A S | ✓ S | — | — | — | — |
| teaching_assignment.archive | ✓ O | A S | A S | ✓ S | — | — | — | — |

Parent/Student hanya melihat display schedule yang relevan, bukan assignment administrative metadata.

---

# 9. Schedule Matrix

| Permission | Org Owner | School Admin | Principal | Vice Principal | Teacher | Homeroom | Parent | Student |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| schedule.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C/W | ✓ C | ✓ R | ✓ W |
| schedule.create | ✓ O | ✓ S | A S | ✓ S | — | — | — | — |
| schedule.update | ✓ O | ✓ S | A S | ✓ S | — | — | — | — |
| schedule.publish | ✓ O | A S | A S | ✓ S | — | — | — | — |
| schedule.archive | ✓ O | A S | A S | ✓ S | — | — | — | — |

---

# 10. Attendance Matrix

| Permission | Org Owner | School Admin | Principal | Vice Principal | Teacher | Homeroom | Parent | Student |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| attendance.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | ✓ R | ✓ W |
| attendance.session.create | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | — | — |
| attendance.record | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | — | — |
| attendance.submit | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | — | — |
| attendance.correct_open | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | — | — |
| attendance.correct_locked | ✓ O | A S | ✓ S | A S | A C | A C | — | — |
| attendance.lock | ✓ O | ✓ S | ✓ S | A S | — | A C | — | — |
| attendance.export | ✓ O | ✓ S | ✓ S | ✓ S | — | ✓ C | — | — |

Perubahan locked attendance wajib audit log dan correction reason.

---

# 11. Assessment & Score Matrix

| Permission | Org Owner | School Admin | Principal | Vice Principal | Teacher | Homeroom | Parent | Student |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| assessment.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | ✓ R* | ✓ W* |
| assessment.create | ✓ O | — | ✓ S* | ✓ S* | ✓ C | ✓ C* | — | — |
| assessment.update_own | ✓ O | — | ✓ S | ✓ S | ✓ C/W | ✓ C/W | — | — |
| assessment.archive_own | ✓ O | — | A S | A S | ✓ C/W* | ✓ C/W* | — | — |
| assessment.publish | ✓ O | — | ✓ S | ✓ S | ✓ C/W | ✓ C/W | — | — |
| score.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | ✓ R* | ✓ W* |
| score.enter | ✓ O | — | ✓ S* | ✓ S* | ✓ C | ✓ C* | — | — |
| score.update_open | ✓ O | — | ✓ S | ✓ S | ✓ C | ✓ C* | — | — |
| score.update_locked | ✓ O | — | ✓ S | A S | A C | A C | — | — |
| score.export | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | — | — |

Parent/Student hanya melihat nilai yang status publikasinya mengizinkan.

Homeroom tidak otomatis boleh mengubah nilai semua mata pelajaran; permission tersebut hanya ada jika sekolah memberi policy tambahan.

---

# 12. Report Card Matrix

| Permission | Org Owner | School Admin | Principal | Vice Principal | Teacher | Homeroom | Parent | Student |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| report_card.read | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C* | ✓ C | ✓ R | ✓ W |
| report_card.generate | ✓ O | ✓ S | ✓ S | ✓ S | — | ✓ C | — | — |
| report_card.edit_narrative | ✓ O | — | ✓ S | ✓ S | A C* | ✓ C | — | — |
| report_card.submit | ✓ O | — | ✓ S | ✓ S | — | ✓ C | — | — |
| report_card.review | ✓ O | — | ✓ S | ✓ S | — | — | — | — |
| report_card.publish | ✓ O | — | ✓ S | A S | — | — | — | — |
| report_card.revise_published | ✓ O | — | A S | A S | — | — | — | — |
| report_card.download | ✓ O | ✓ S | ✓ S | ✓ S | ✓ C | ✓ C | ✓ R | ✓ W |

---

# 13. Audit & Security Matrix

| Permission | Org Owner | School Admin | Principal | Vice Principal | Teacher | Homeroom | Parent | Student |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| audit.read | ✓ O | A S | ✓ S | A S | — | — | — | — |
| audit.export | A O | — | A S | — | — | — | — | — |
| security.session_revoke_member | ✓ O | A S | — | — | — | — | — | — |

Audit log dapat memuat data sensitif. Bahkan user dengan permission audit tidak otomatis boleh melihat full before/after payload untuk semua entity; masking dapat diterapkan.

---

# 14. Role-Specific Notes

## Organization Owner
- Tidak perlu digunakan untuk aktivitas harian.
- Dapat mengelola sekolah dan high-level membership.
- Akses organization-wide.

## School Admin / TU
- Mengelola master data untuk School scope. Student/Staff identity yang organization-scoped hanya terlihat bila memiliki enrollment/assignment pada School yang diizinkan.
- Tidak otomatis menjadi approver akademik final.
- Dapat membantu import/export.

## Principal
- Read visibility luas.
- Approval/review/publish tertentu.
- Tidak otomatis mengedit nilai guru kecuali elevated correction permission.

## Curriculum Vice Principal
- Mengelola academic setup, teaching assignment, schedule.
- Dapat diberi assessment oversight.

## Teacher
- Scope didapat dari TeachingAssignment.
- Hanya kelas/mapel yang ditugaskan.
- Nilai dan assessment miliknya.

## Homeroom Teacher
- Scope dari Classroom.
- Mengelola presensi kelas dan narrative/report workflow.
- Tidak otomatis mengubah score guru mata pelajaran lain.

## Parent
- Tidak memakai school-wide permission.
- Akses hanya anak dengan active StudentGuardian relation.

## Student
- Hanya data dirinya.

---

# 15. Role Combination

Seorang user dapat memiliki beberapa role sekaligus.

Permission efektif = union permission, tetapi scope tetap dihitung per grant.

Contoh:

```text
User: Rina
Role 1: Teacher, CLASS 7A
Role 2: Homeroom Teacher, CLASS 8B
```

`student.read` efektif:
- siswa 7A karena teacher assignment,
- siswa 8B karena homeroom,
- bukan seluruh school.

---

# 16. Deny Rules yang Mengalahkan Grant

Untuk Core V1, gunakan model allow-list sederhana. Namun beberapa hard rule selalu berlaku:

1. Cross-organization access = deny.
2. Suspended membership = deny.
3. Archived/ended membership role = deny.
4. Parent relationship revoked = deny.
5. Published/locked academic records mengikuti workflow lock meskipun user memiliki general update permission.
6. Service-role operations hanya server trusted.

---

# 17. RLS Mapping Strategy

Permission matrix tidak sebaiknya direplikasi sebagai hardcoded UI logic saja.

Gunakan helper:

```text
has_permission(profile_id, permission_code, resource_context)
```

atau beberapa function teroptimasi yang memeriksa:
- active membership,
- role permission,
- scope.

Untuk table high-traffic, dapat digunakan precomputed access strategy/cached claims setelah profiling menunjukkan kebutuhan. Jangan optimasi prematur dengan mengorbankan correctness.

---

# 18. UI Behavior

- Menu hidden jika user tidak memiliki read permission.
- Tombol action hidden/disabled jika tidak memiliki permission.
- Direct URL tetap harus ditolak server/RLS.
- Error authorization menggunakan pesan aman, tidak membocorkan keberadaan record tenant lain.

---

# 19. Permission Change Audit

Perubahan berikut wajib audit:
- membership created/disabled,
- role assigned/removed,
- role permission changed,
- scope changed,
- parent-child access changed,
- privileged correction access digunakan.

---

# 20. Approval Before Implementation

Sebelum seed roles dibuat, sekolah pilot harus mengonfirmasi minimal:

- siapa yang boleh publish rapor,
- siapa yang boleh koreksi presensi locked,
- apakah School Admin boleh melihat nilai,
- apakah Principal boleh mengubah nilai atau hanya approve,
- apakah Homeroom boleh mengubah nilai mata pelajaran lain,
- visibility nilai ke parent sebelum rapor publish.

Jika belum ada keputusan sekolah pilot, gunakan default konservatif di dokumen ini.
