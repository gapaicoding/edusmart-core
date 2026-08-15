# EduSmart — Authentication Architecture

**Versi:** 1.0  
**Status:** Foundation Auth Design  
**Identity Provider awal:** Supabase Auth  
**Authorization:** Custom Membership + RBAC + PostgreSQL RLS

---

## 1. Separation of Concerns

EduSmart membedakan:

```text
AUTHENTICATION
"Siapa kamu?"
        ↓
Supabase Auth

AUTHORIZATION
"Apa yang boleh kamu lakukan dan pada data mana?"
        ↓
EduSmart Membership + Role + Permission + Scope + RLS
```

Supabase Auth tidak menjadi source of truth untuk role bisnis EduSmart.

---

## 2. Identity Model

```text
auth.users
   1
   │
   1
profiles
   │
   ├── organization_memberships
   ├── guardians.profile_id (optional)
   ├── staff_members.profile_id (optional)
   └── students.profile_id (optional)
```

### `auth.users`
Dikelola Supabase.

Menyimpan:
- credential identity,
- provider information,
- auth lifecycle.

### `profiles`
Dikelola EduSmart.

Menyimpan:
- display identity,
- phone,
- avatar,
- application status.

Jangan menyimpan password hash di tabel EduSmart.

---

## 3. Login Methods Core V1

### Wajib
- Email + password
- Forgot password / password reset

### Recommended
- Magic link untuk invitation/onboarding tertentu

### Future
- Google Workspace SSO
- Microsoft SSO
- MFA mandatory untuk role privileged

Phone OTP tidak wajib Core V1 kecuali sekolah pilot membutuhkannya.

---

## 4. Login Flow

```text
User enters credential
        ↓
Supabase Auth validates
        ↓
Session created
        ↓
Load profiles
        ↓
Load active organization memberships
        ↓
No membership?
    ├── yes → onboarding / access pending
    └── no
        ↓
Resolve accessible organizations/schools
        ↓
Select or restore active context
        ↓
Load role + permission summary
        ↓
Enter application
```

Jika hanya memiliki satu context, selection dapat otomatis.

---

## 5. Invitation Flow

### Admin invites staff

```text
Authorized Admin
  ↓
Create invitation
  ↓
Send email with single-use token
  ↓
Recipient opens link
  ↓
Existing auth account?
  ├── yes → authenticate
  └── no  → register/set password
  ↓
Validate invitation token + email + expiry
  ↓
Activate membership
  ↓
Assign approved role/scope
  ↓
Audit log
```

Security rules:
- store invitation token hash, not raw token,
- single-use,
- short expiry,
- role/scope cannot be modified by invitee,
- acceptance validates intended email or approved identity.

---

## 6. Staff Account Link

Staff domain record dapat dibuat sebelum akun.

```text
StaffMember
profile_id = NULL
```

Ketika invitation diterima:

```text
Profile created
  ↓
StaffMember.profile_id linked
  ↓
StaffSchoolAssignment verified
  ↓
Membership active
```

Jangan membuat duplicate StaffMember ketika user menerima invite. Jika personel bekerja di lebih dari satu School, tambahkan `StaffSchoolAssignment`, bukan duplicate StaffMember.

---

## 7. Guardian Account Link

Guardian juga dapat ada sebelum login.

```text
Guardian
profile_id = NULL
```

Activation:

```text
Guardian verification/invite
  ↓
Profile
  ↓
Guardian.profile_id
  ↓
StudentGuardian relationship
  ↓
Parent Portal access
```

Parent access berasal dari `StudentGuardian`, bukan dari input student ID oleh parent.

---

## 8. Student Account Link

Optional Core V1.

Jika diaktifkan:
- akun siswa terhubung ke `students.profile_id`,
- authorization scope `OWN`,
- tidak mengandalkan data yang dikirim client untuk memilih student.

---

## 9. Session Strategy

Gunakan Supabase session dengan access token + refresh token sesuai client integration resmi.

Aplikasi menyimpan:
- auth session sesuai library,
- active organization/school sebagai app context,
- tidak menyimpan service role key,
- tidak menyimpan permission sensitive sebagai satu-satunya authorization source.

Permission snapshot pada client hanya untuk UX.

---

## 10. JWT Claims Strategy

JWT boleh berisi minimal custom claims untuk performance, tetapi:

**Jangan masukkan seluruh RBAC matrix dan school list sebagai source of truth yang lama hidup.**

Alasan:
- role dapat berubah,
- school access dapat dicabut,
- token lama tidak boleh memberikan hak terlalu lama.

Recommended:
- JWT menyimpan stable identity.
- RLS/helper memeriksa membership aktif.
- optional short-lived claims digunakan setelah profiling kebutuhan performa.

---

## 11. Active Context

App state:

```text
activeOrganizationId
activeSchoolId
activeAcademicYearId
```

Digunakan untuk:
- routing,
- filtering,
- UX.

Tidak digunakan sebagai bukti authorization.

Switch school:

```text
User selects School B
  ↓
Server verifies membership/scope
  ↓
Context changes
  ↓
Queries refetch
```

---

## 12. Password & Credential Policy

Sebelum production:

- minimum password strength mengikuti provider policy dan kebijakan internal,
- breached-password protection jika tersedia pada plan/provider,
- rate limiting login,
- account enumeration resistant errors,
- reset links short-lived,
- privileged role sebaiknya MFA.

Exact password length bukan ditetapkan di PRD dan harus diselaraskan dengan policy provider/security review saat implementasi.

---

## 13. MFA Roadmap

### Core Pilot
Optional.

### Production commercial recommended
MFA required for:
- Organization Owner,
- School Admin privileged,
- Principal jika memiliki publish/correction permission,
- Platform internal admin.

Parent/student MFA optional.

---

## 14. Account Lifecycle

### Profile status

```text
ACTIVE
DISABLED
```

### Membership status

```text
INVITED
ACTIVE
SUSPENDED
ENDED
```

Disabling membership tidak harus menghapus auth account karena user dapat memiliki membership lain.

Example:

```text
User Budi
School A membership ended
School B membership active
```

Auth user tetap valid.

---

## 15. Immediate Access Revocation

Ketika role/membership dicabut:

1. DB membership berubah segera.
2. RLS membaca status terbaru.
3. Session client boleh tetap hidup tetapi query unauthorized akan gagal.
4. Untuk incident/security, refresh/session dapat direvoke sesuai provider capability.

Ini alasan authorization tidak boleh hanya bergantung pada stale JWT role claim.

---

## 16. RLS + Auth Mapping

Typical flow:

```text
auth.uid()
  ↓
profiles.id
  ↓
organization_memberships
  ↓
membership_roles
  ↓
role_permissions
  ↓
scope check
```

Parent special path:

```text
auth.uid()
  ↓
profiles
  ↓
guardians
  ↓
student_guardians
  ↓
student
```

Student special path:

```text
auth.uid()
  ↓
profiles
  ↓
students.profile_id
```

---

## 17. Server Privileged Operations

Operations yang tidak dilakukan langsung dari browser:

- tenant provisioning,
- bulk import,
- role seed/update,
- cross-table transactional workflows kompleks,
- generated report finalization,
- support access,
- system scheduled jobs.

Gunakan trusted backend/edge/server dengan service credential yang disimpan di server environment only.

---

## 18. Authentication Routes / Screens

Core V1:

```text
/login
/forgot-password
/reset-password
/accept-invite
/access-pending
/select-organization
/select-school
/logout
```

Optional:

```text
/account/security
/account/sessions
```

---

## 19. Parent Portal Login UX

Setelah login parent:

```text
Resolve Guardian
  ↓
Load active StudentGuardian relationships
  ↓
0 child → access support state
1 child → open dashboard child
>1 child → child switcher
```

Child switcher tidak mengubah permission; permission tetap relationship-derived.

---

## 20. Audit Events

Wajib dicatat:
- login success/failure summary where appropriate,
- invitation created/accepted/revoked,
- password reset request completion metadata,
- membership activated/suspended/ended,
- role assigned/removed,
- privileged access used,
- parent-child relation access changed.

Jangan simpan password, reset token mentah, atau credential secret dalam audit log.

---

## 21. Security Threat Checklist

### Prevent cross-tenant access
RLS + authorization + tenant FK consistency.

### Prevent IDOR
Direct resource ID selalu divalidasi terhadap scope.

### Prevent role escalation
Client tidak dapat menulis `membership_roles` tanpa privileged permission.

### Prevent invite hijacking
Hash token + expiry + intended identity validation.

### Prevent service-key leakage
Service keys server-only.

### Prevent stale privilege
Live membership check for sensitive operations.

### Prevent insecure parent linking
No arbitrary child code lookup that immediately grants access.

---

## 22. Lovable Integration Rules

Saat menggunakan Lovable:

1. Connect ke Supabase project yang dimiliki tim.
2. Jangan expose service role key ke frontend.
3. Auth forms boleh dibangun Lovable.
4. Role management dan RLS mengikuti migration/schema yang telah direview.
5. Jangan menerima autogenerated policy yang terlalu permissive seperti `authenticated can select all`.
6. Semua perubahan auth table/policy masuk Git migration.

---

## 23. Definition of Done

Authentication dianggap siap ketika:

- user dapat login/logout/reset password,
- invitation dapat di-accept dengan aman,
- profile terpisah dari auth.users,
- membership mendukung multi-organization/school,
- role tidak disimpan sebagai satu field pada user,
- revoked membership langsung kehilangan akses data melalui RLS,
- parent hanya melihat related child,
- service credentials tidak berada di browser,
- auth flow memiliki audit trail yang memadai.
