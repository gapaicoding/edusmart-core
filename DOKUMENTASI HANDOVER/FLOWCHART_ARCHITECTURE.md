# EduSmart Architecture Flowchart

> **Baseline dokumentasi:** 6 Oktober 2026. Dokumen ini disusun dari implementasi aktual repository `gapaicoding/edusmart-core`, dokumentasi arsitektur/migration/report di repository, serta PRD EduSmart v1.0 yang sebelumnya diberikan. Jika ada konflik, **kode + migration + kontrak keamanan pada `origin/main` menjadi source of truth implementasi**, sedangkan PRD menjadi source of truth untuk visi/roadmap.


```mermaid
flowchart LR
    subgraph CLIENT["Client Layer"]
        WEB[React 19 UI]
        ROUTER[TanStack Router]
        QUERY[TanStack Query]
        FORMS[React Hook Form + Zod]
        THEME[ID/EN + Light/Dark]
    end

    subgraph APP["TanStack Start / Application Layer"]
        ROUTES[Protected & Public Routes]
        SF[Authenticated Server Functions]
        DOMAIN[Domain Services / Commands / Queries]
        ADAPTERS[Provider Adapter Boundary]
        REPORTS[PDF / Excel / Reporting]
    end

    subgraph WORKER["B29 Worker Runtime"]
        WCFG[Validated Worker Config]
        POLL[Polling + School Fairness]
        CLAIM[Claim / Lease / Fencing]
        EXEC[Bounded Execution]
        HEALTH[Heartbeat / Health]
        SHUTDOWN[Graceful Shutdown]
    end

    subgraph SUPABASE["Supabase"]
        AUTH[Supabase Auth]
        PG[(PostgreSQL)]
        RLS[RLS / FORCE RLS]
        RPC[Scoped RPCs]
        MIG[Append-only Migrations]
        VAL[SQL Validators]
    end

    subgraph DOMAINS["Core Domain Data"]
        TENANT[Organization / School / Membership]
        ACADEMIC[SIS / Academic / Attendance / Gradebook]
        ADMISSION[PPDB / Admissions / Leads]
        FINANCE[Billing / Payment / Reconciliation]
        COMM[Announcements / Delivery Jobs / Attempts]
    end

    subgraph EXTERNAL["External Systems"]
        MIDTRANS[Midtrans BI-SNAP QRIS Sandbox]
        COMMPROVIDER[Real Communication Provider - Not Configured]
        CALLBACK[Future Communication Receipt/Webhook]
    end

    WEB --> ROUTER
    ROUTER --> ROUTES
    QUERY --> SF
    FORMS --> SF
    THEME --> WEB

    ROUTES --> SF
    SF --> DOMAIN
    DOMAIN --> AUTH
    DOMAIN --> RPC
    DOMAIN --> REPORTS

    AUTH --> TENANT
    RPC --> RLS
    RLS --> PG
    MIG --> PG
    VAL --> PG

    PG --> TENANT
    PG --> ACADEMIC
    PG --> ADMISSION
    PG --> FINANCE
    PG --> COMM

    WCFG --> POLL
    POLL --> CLAIM
    CLAIM --> RPC
    EXEC --> ADAPTERS
    CLAIM --> EXEC
    EXEC --> RPC
    EXEC --> HEALTH
    SHUTDOWN --> HEALTH
    HEALTH --> RPC

    FINANCE --> ADAPTERS
    ADAPTERS --> MIDTRANS

    COMM --> CLAIM
    ADAPTERS -. future provider .-> COMMPROVIDER
    COMMPROVIDER -. future signed events .-> CALLBACK
    CALLBACK -. future normalization .-> DOMAIN

    style COMMPROVIDER stroke-dasharray: 5 5
    style CALLBACK stroke-dasharray: 5 5
```

## Boundary Penting

1. **Browser tidak memegang service-role credential.**
2. Server function memvalidasi auth/context/capability sebelum domain action.
3. PostgreSQL RLS tetap security authority.
4. B29 worker adalah trusted server process terpisah dari browser user.
5. Delivery claim/finalize adalah server/worker-only.
6. Real communication provider belum dikonfigurasi pada baseline ini.
7. Midtrans berada di payment adapter boundary; provider event tidak menjadi accounting truth tanpa reconciliation.
