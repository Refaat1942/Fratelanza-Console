# Fratelanza Management Console

A full-stack web ERP system for managing software & training projects, freelancers, clients, receivables, expenses, tasks, and financials. Converted from a Python/tkinter desktop app.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/fratelanza run dev` — run the frontend (port 18584)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — Express session secret
- Optional env: `ADMIN_USERNAME` — initial admin username (default: `admin`)
- Optional env: `ADMIN_PASSWORD` — initial admin password (falls back to `MASTER_PASSWORD` in development, otherwise defaults to `fratelanza2024`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite 7, Tailwind CSS v4, shadcn/ui, Recharts, Wouter
- API: Express 5, Pino logging
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle for API), Vite (frontend)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI source of truth
- `lib/db/src/schema/` — Drizzle schema files (projects, freelancers, clients, templates, quotes, expenses, tasks, team)
- `artifacts/api-server/src/routes/` — Express route files (one per module)
- `artifacts/fratelanza/src/pages/` — React page components (one per module)
- `artifacts/fratelanza/src/components/` — shared UI components (layout, privacy-wrapper, shadcn/ui)
- `artifacts/fratelanza/src/lib/privacy-context.tsx` — privacy mode React context

## Architecture decisions

- **Contract-first**: OpenAPI spec → Orval codegen → typed React Query hooks + Zod schemas. Never hand-write API client code.
- **Privacy mode**: All financial values wrapped in `<PrivacyWrapper>` — toggled via sidebar button, stored in React context. Masks values as `***`.
- **Username+password auth**: Users stored in `users` table with bcrypt password hash. `/api/auth/login` sets a session cookie (`fratelanza.sid`) backed by Postgres (`session` table via `connect-pg-simple`). All `/api/*` routes require auth except `/api/healthz`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`. Initial admin user auto-seeded from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env on first start.
- **Proxy routing**: All traffic goes through the Replit shared proxy at port 80. API is mounted at `/api`, frontend at `/`. Never call service ports directly.
- **Drizzle push**: Schema changes applied via `pnpm --filter @workspace/db run push` (no migration files in dev).

## Product

- **Dashboard** — KPI cards (revenue, paid, remaining, net profit, expenses), profit-by-type bar chart, payment alerts
- **Projects** — Full CRUD for software & training projects with payment logging, status tracking, per-project profitability
- **Receivables** — Filtered view of projects with outstanding balances; inline payment logging with overdue highlighting
- **Freelancers** — Directory with specialization, rating (1–5 stars), earned/balance tracking
- **Clients** — CRM with 360° profile (aggregated project history, totals)
- **Templates** — Reusable service pricing templates (Software & Training categories)
- **Sales Quotes** — Quote builder with line items, payment terms, milestones (English/Arabic)
- **Expenses** — General expense log with date-range filter and running total
- **Tasks** — Kanban board (Todo / In Progress / Done) with priority, assignment, due date
- **Finance / P&L** — Date-filtered P&L report with monthly bar chart, full project breakdown

## Deployment (Hostinger VPS)

Files in repo root:

- `Dockerfile.api` — multi-stage build for the Express API
- `Dockerfile.web` — multi-stage Vite build + nginx static serving
- `docker-compose.yml` — orchestrates postgres, api, web containers
- `nginx.conf` — nginx config for SPA routing + asset caching
- `.github/workflows/deploy.yml` — builds + pushes images to GHCR, deploys via SSH
- `.github/workflows/typecheck.yml` — typecheck CI on every PR/push

### Required GitHub Secrets for deploy workflow

| Secret              | Description                                        |
| ------------------- | -------------------------------------------------- |
| `VPS_HOST`          | VPS IP or hostname                                 |
| `VPS_USER`          | SSH username (e.g. `root`)                         |
| `VPS_SSH_KEY`       | Private SSH key for VPS access                     |
| `POSTGRES_PASSWORD` | Postgres DB password                               |
| `SESSION_SECRET`    | Express session secret                             |
| `ADMIN_USERNAME`    | Initial admin username (optional, default `admin`) |
| `ADMIN_PASSWORD`    | Initial admin password (required on first deploy)  |

### VPS first-run setup

```bash
# On VPS
mkdir -p /opt/fratelanza
# Copy docker-compose.yml
# Create .env with POSTGRES_PASSWORD, SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, REGISTRY, IMAGE_TAG
# Then run:
docker compose up -d
```

## DB Tables

| Table              | Purpose                                   |
| ------------------ | ----------------------------------------- |
| `pricing_records`  | All project records (software + training) |
| `freelancers`      | Freelancer directory                      |
| `clients`          | Client CRM                                |
| `templates`        | Service pricing templates                 |
| `sales_quotes`     | Quotes                                    |
| `general_expenses` | Expense log                               |
| `tasks`            | Kanban tasks                              |
| `project_team`     | Project ↔ freelancer assignments          |
| `users`            | Login accounts (bcrypt password hash)     |
| `session`          | Express session store (connect-pg-simple) |

## User preferences

- Dark navy theme: `#0a192f` background, `#00BFFF` accent (electric blue)
- Financial values always wrapped in `<PrivacyWrapper>` component
- EGP (Egyptian Pound) as currency
- All pages must have search/filter and CRUD modals

## Gotchas

- The `pnpm run typecheck` command does libs first (`tsc --build`) then leaf packages (`--noEmit`). Always trust this result over LSP.
- Codegen (`pnpm --filter @workspace/api-spec run codegen`) must be re-run after any OpenAPI spec change.
- Do not call `pnpm run dev` at workspace root — it has no `dev` script.
- Frontend uses `import.meta.env.BASE_URL` for Wouter base; Vite injects this from `BASE_PATH` env var in workflow.
- API routes use `id: number` params for update/delete (not `code` strings) — always check generated hook signatures.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- Generated hooks: `lib/api-client-react/src/`
- Generated Zod schemas: `lib/api-zod/src/`
