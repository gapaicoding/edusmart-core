# Coolify deployment contract

EduSmart is a TanStack Start SSR application. Its deployment artifact is built
with Bun and Nitro's `node-server` preset, then run with Node.js 22 LTS. Coolify
provides the reverse proxy and TLS; the application does not run Nginx, bind
ports 80/443, or manage certificates.

## Container contract

- Build: `bun install --frozen-lockfile`, then `bun run build`
- Nitro target: `node-server`
- Artifact: `.output/`
- Start: `node .output/server/index.mjs`
- Internal host: `0.0.0.0`
- Internal port: `3000`
- Health path: `GET /healthz`
- Runtime user: the non-root `node` user from the official Node image
- Application volumes: none; the application container is stateless

The public Supabase variables are Docker build inputs because Vite embeds them
in browser assets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Runtime variables are configured in Coolify:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HOST`
- `PORT`
- `NODE_ENV`

`SUPABASE_SERVICE_ROLE_KEY` is a privileged runtime-only secret. Never give it
a `VITE_` prefix, use it as a Docker build argument, bake it into an image, or
commit it. Coolify must hold all real environment bindings. The repository's
`.env.example` contains names and safe fixed process settings only.

`SUPABASE_PROJECT_ID` and `VITE_SUPABASE_PROJECT_ID` are intentionally omitted:
the application does not read them.

## Staging-first release

The mandatory sequence is:

`local -> Git -> Coolify staging -> staging HTTPS verification -> production approval -> production`

Staging uses `https://staging.app.gapaischool.tech`. Production uses
`https://app.gapaischool.tech`, but production must never be deployed or changed
before staging is approved. Use the same approved Docker design and pinned
commit/image for production.

Staging and production must use different managed Supabase projects, databases,
publishable keys, service-role keys, users, and future storage. Never point
staging at production data.

## Supabase Auth URLs

Configure these externally in each environment's Supabase dashboard.

Staging:

- Site URL: `https://staging.app.gapaischool.tech`
- Reset redirect: `https://staging.app.gapaischool.tech/reset-password`
- Invite redirect: `https://staging.app.gapaischool.tech/accept-invite*`

Production:

- Site URL: `https://app.gapaischool.tech`
- Reset redirect: `https://app.gapaischool.tech/reset-password`
- Invite redirect: `https://app.gapaischool.tech/accept-invite*`

## Database boundary

Managed Supabase per environment is the current recommended backend. Plain
PostgreSQL is not a drop-in replacement: the application depends on Supabase
Auth, PostgREST, `auth.uid()`, RLS, RPC functions, Supabase database roles, and
service-role behavior. Do not add a PostgreSQL container to the application
deployment.

Do not run Supabase migrations during container startup. Schema changes require
a separate controlled process: backup, review, staging application, validation,
approval, and only then an explicitly approved production change. Fresh staging
bootstrap remains a separate external gate.

Production deployment always requires explicit human approval after staging is
healthy over HTTPS and its auth flows and database state are verified.
