# AGENTS.md

## Cursor Cloud specific instructions

### Product

**Fratelanza Management Console** — full-stack ERP (React + Express + PostgreSQL). See `replit.md` for architecture and module overview.

### Node.js version

The repo targets **Node.js 24** (see `.replit`). Cloud VMs may ship Node 22 on `/exec-daemon/node`, which takes precedence over nvm. Before any `pnpm` or `node` command:

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24
export PATH="$NVM_DIR/versions/node/$(node -v | tr -d v)/bin:$PATH"
```

Verify with `node -v` → `v24.x`.

### PostgreSQL

The API requires Postgres 16+. Docker is not available on all Cloud VMs; use the system package instead:

```bash
sudo service postgresql start
```

Default local credentials (created during initial setup):

- Database: `fratelanza_console`
- User: `fratelanza_console`
- Password: `change_me`
- URL: `postgres://fratelanza_console:change_me@localhost:5432/fratelanza_console`

Apply schema after dependency install: `pnpm --filter @workspace/db run push` (requires `DATABASE_URL`).

### Required environment variables

| Variable | Example | Used by |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://fratelanza_console:change_me@localhost:5432/fratelanza_console` | API, db push |
| `SESSION_SECRET` | 32+ char random string | API |
| `PORT` | `8080` (API), `18584` (frontend) | Both services |
| `BASE_PATH` | `/` | Frontend (Vite) |
| `ADMIN_USERNAME` | `admin` | API seed (optional) |
| `ADMIN_PASSWORD` | `fratelanza2024` | API seed (optional) |

### Running services (dev)

Three processes are needed for end-to-end testing. The frontend calls `/api` on the same origin; on Replit a platform proxy handles routing. Locally, run an nginx reverse proxy (or equivalent) on port **8888**:

1. **API** — `PORT=8080 pnpm --filter @workspace/api-server run dev`
2. **Frontend** — `PORT=18584 BASE_PATH=/ pnpm --filter @workspace/fratelanza run dev`
3. **Proxy** — nginx config that forwards `/api/` → `:8080` and `/` → `:18584` (Vite HMR needs WebSocket upgrade headers on `/`).

Open the app at `http://127.0.0.1:8888`. Default login: `admin` / `fratelanza2024`.

### Common commands

See `replit.md` and root `package.json` for standard commands:

- `pnpm run typecheck` — full monorepo typecheck (CI equivalent)
- `pnpm run build` — typecheck + build all packages (mockup-sandbox also needs `PORT`/`BASE_PATH`)
- `pnpm --filter @workspace/api-server run build` — API only
- `PORT=18584 BASE_PATH=/ pnpm --filter @workspace/fratelanza run build` — frontend only

### Gotchas

- `artifacts/api-server` `dev` script rebuilds on every start (`build && start`); first start takes a few seconds.
- `scripts/post-merge.sh` uses filter `db` but the package name is `@workspace/db` — use the full filter name.
- `pnpm run build` fails on `mockup-sandbox` without `PORT`/`BASE_PATH`; that package is optional for console E2E.
- Nginx on Cloud VMs needs writable temp/log paths under `/tmp` (cannot write to `/var/lib/nginx` or `/var/log/nginx` without root).
