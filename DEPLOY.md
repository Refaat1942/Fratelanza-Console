# Manual Deployment — Hostinger VPS (Management Console)

Deploys the **Fratelanza Management Console** to `/opt/fratelanza-console` without touching other projects on the VPS.

## How it's isolated

- All containers are prefixed with `fratelanza-console-`
- Web binds to **127.0.0.1:3100** only
- API binds to **127.0.0.1:3101** only
- Database uses its own volume `fratelanza_console_pgdata`
- Does **not** affect `lotus_*`, `fratelanza_postgres`, `fratelanza-hub-*`, or `/opt/fratelanza`

---

## Step 1 — SSH into your VPS

```bash
ssh root@YOUR_VPS_IP
```

---

## Step 2 — Create project folder

```bash
mkdir -p /opt/fratelanza-console/web-static
cd /opt/fratelanza-console
```

---

## Step 3 — Create your `.env` file

```bash
nano /opt/fratelanza-console/.env
```

Paste and fill in:

```
POSTGRES_PASSWORD=choose_a_strong_password
SESSION_SECRET=any_long_random_string_here_32chars_min
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_app_login_password
```

Save with `Ctrl+O`, exit with `Ctrl+X`.

---

## Step 4 — Copy `docker-compose.yml` and `nginx.conf`

```bash
# From your local machine
scp docker-compose.yml nginx.conf root@YOUR_VPS_IP:/opt/fratelanza-console/
```

Or paste them directly on the VPS into `/opt/fratelanza-console/`.

---

## Step 5 — First-time start (database only)

```bash
cd /opt/fratelanza-console
docker compose up -d db
```

Wait for the database to be healthy, then run the full deploy script (Step 6).

---

## Step 6 — Build and deploy

```bash
curl -fsSL https://raw.githubusercontent.com/Refaat1942/Fratelanza-Console/main/scripts/deploy-console-vps.sh -o /tmp/deploy-console-vps.sh
chmod +x /tmp/deploy-console-vps.sh
/tmp/deploy-console-vps.sh
```

This script:
- Clones/updates source code to `/opt/fratelanza-console/source`
- Builds `fratelanza-console-api:local`
- Builds web UI into `/opt/fratelanza-console/web-static`
- Restarts **only** `fratelanza-console-api` and `fratelanza-console-web`

---

## Step 7 — Set up your domain with Nginx

```bash
nano /etc/nginx/sites-available/fratelanza-console
```

Paste the contents of `nginx-console.conf`, replace the domain, then:

```bash
ln -s /etc/nginx/sites-available/fratelanza-console /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## Step 8 — (Optional) HTTPS

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d console.yourdomain.com
```

---

## Updating to a new version

```bash
/tmp/deploy-console-vps.sh
```

Hard-refresh the browser: **Ctrl+Shift+R**

---

## Useful commands

```bash
cd /opt/fratelanza-console

# View logs (console only)
docker logs -f fratelanza-console-api
docker logs -f fratelanza-console-web

# Restart console API only
docker restart fratelanza-console-api

# Stop console only
docker compose down

# DB schema push (one-off column add example)
docker exec -it fratelanza-console-db psql -U fratelanza_console -d fratelanza_console -c "ALTER TABLE sales_quotes ADD COLUMN IF NOT EXISTS line_items text;"
```

---

## Port reference

| Service | Host port | Internal port |
|---------|-----------|---------------|
| Web (nginx) | 127.0.0.1:3100 | 80 |
| API (express) | 127.0.0.1:3101 | 8080 |
| Database | not exposed | 5432 |

---

## Folder layout on VPS

```
/opt/fratelanza-console/
├── .env
├── docker-compose.yml
├── nginx.conf
├── web-static/          ← built frontend (served by fratelanza-console-web)
└── source/              ← git clone (used for Docker builds)
```

**Do not deploy from `/opt/fratelanza`** — that is a separate project.
