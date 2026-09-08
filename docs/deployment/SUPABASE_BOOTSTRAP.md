# Canonical Supabase bootstrap

EduSmart runs the application on Hostinger using Docker and Coolify. Its database architecture uses two separate managed Supabase projects: a dedicated **STAGING** project and a distinct **PRODUCTION** project. Bootstrap and deployment always proceed through staging first. Production bootstrap or deployment is not authorized yet.

## Fresh managed-project bootstrap

Use this sequence only for a brand-new managed Supabase project after confirming the target is the dedicated staging project:

1. Verify the target project and environment out of band.
2. Apply `20260815000000_edusmart_canonical_foundation.sql` first.
3. Apply every later timestamped migration once, in filename order.
4. Run `supabase/validation/validate_final_schema.sql` and require a clean pass.
5. Generate application types from the validated schema and run the repository type-check and build.
6. Only after independent review may application deployment point at that staging project.

The canonical migration intentionally contains foundation files 07, 08, and 09, in that order: schema, RLS, then RBAC registry data. During schema proof, do **not** apply `10_SEED_DEMO_SCHOOL.sql`, `11_BOOTSTRAP_FIRST_ADMIN_AUTO.sql`, or any equivalent demo/first-admin seed. The proof must finish with zero organizations, schools, students, and staff members.

## Environment safety

- Existing **Development must NEVER execute this new baseline SQL**. Its schema already predates the baseline, so executing it would attempt to recreate existing objects.
- Any future Development adoption must be migration-history reconciliation only, after independent schema verification and explicit human approval. Reconciliation records already-proven history; it does not execute the baseline against Development.
- Staging and Production must remain separate managed Supabase projects with separate credentials and deployment configuration.
- Production remains out of scope until it is explicitly authorized after staging proof and review.
- Never infer a target from cached CLI linking state. Confirm the intended environment before any managed-project operation.

For local proof, use Supabase CLI `2.115.0` with a fresh local reset, apply the complete migration chain, run the final validator, and stop the local stack after evidence is captured.
