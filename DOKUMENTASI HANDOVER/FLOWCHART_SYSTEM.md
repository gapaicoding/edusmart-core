# EduSmart System Flowchart

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


Diagram berikut menggambarkan flow sistem tingkat produk/domain, bukan sequence diagram setiap request.

```mermaid
flowchart TD
    U[User / Staff / Parent / Student / Applicant] --> AUTH[Supabase Auth / Public Entry]
    AUTH --> CTX{Authenticated Context?}

    CTX -->|Staff| STAFF[Staff Workspace]
    CTX -->|Parent| PARENT[Parent Portal]
    CTX -->|Student| STUDENT[Student Portal]
    CTX -->|Public PPDB| PPDB[Public Admission Form]

    STAFF --> SCHOOL[Organization + School Context]
    SCHOOL --> CAP[Membership + Capability Check]

    CAP --> SIS[SIS]
    CAP --> ACADEMIC[Academic]
    CAP --> ADMISSION[Admissions / CRM]
    CAP --> FINANCE[Finance & Billing]
    CAP --> COMM[Communication Center]
    CAP --> OPS[Pilot / Operations]

    SIS --> DB[(Supabase PostgreSQL)]
    ACADEMIC --> DB
    ADMISSION --> DB
    FINANCE --> DB
    COMM --> DB
    OPS --> DB

    PARENT --> PCTX[Linked Child / Parent Relationship]
    PCTX --> DB

    STUDENT --> SCTX[Own Student Context]
    SCTX --> DB

    PPDB --> ADMISSION

    DB --> RLS[RLS + FORCE RLS + Constraints]
    RLS --> DATA[School / Organization Scoped Data]

    ADMISSION --> LEAD[Pre-Application Lead]
    LEAD --> APP[Admission Application]
    APP --> SISCONV[Controlled SIS Conversion]
    SISCONV --> SIS

    FINANCE --> BILL[Invoice / Payment / Reconciliation]
    BILL --> PAYINTENT[Online Payment Intent]
    PAYINTENT --> QRIS[Midtrans Dynamic QRIS Sandbox]
    QRIS --> PAYCALLBACK[Validated Payment Callback]
    PAYCALLBACK --> BILL

    COMM --> ANN[Announcement + Recipient Snapshot]
    ANN --> QUEUE[External Delivery Queue]
    QUEUE --> WORKER[B29 Communication Worker]
    WORKER --> FAKE[Development Fake Adapter]
    WORKER -. future .-> PROVIDER[Real Communication Provider]
    PROVIDER -. future .-> RECEIPT[Delivery Receipt / Webhook]

    DATA --> REPORT[Reports / PDF / Excel / Portal Views]
    REPORT --> U
```

## Interpretasi

- Semua staff action melewati school context + capability.
- RLS/constraint tetap authoritative walaupun UI sudah melakukan gating.
- Admissions lead tidak langsung membuat Student; formal application menjadi boundary.
- Finance memisahkan accounting truth dari provider integration.
- Communication telah memiliki queue + worker, tetapi real provider masih future scope.
