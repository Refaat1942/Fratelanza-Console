# Manual Deployment — Hostinger VPS

This guide deploys Fratelanza alongside your other projects without touching them.

## How it's isolated

- All containers are prefixed with `fratelanza-console` (set by `name: fratelanza-console` in compose)
- The web container binds to port **3100** on localhost only (`127.0.0.1:3100`)
- The API container binds to port **3101** on localhost only (`127.0.0.1:3101`)
- The database has its own named volume `fratelanza_console_pgdata`
- Your other projects are completely unaffected

---

## Step 1 — SSH into your VPS

```bash
ssh root@YOUR_VPS_IP
```

---

## Step 2 — Create project folder

```bash
mkdir -p /opt/fratelanza
cd /opt/fratelanza
```

---

## Step 3 — Create your `.env` file

```bash
nano .env
```

Paste and fill in:

```
POSTGRES_PASSWORD=choose_a_strong_password
SESSION_SECRET=any_long_random_string_here_32chars_min
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_app_login_password
REGISTRY=ghcr.io/refaat1942
IMAGE_TAG=latest
```

Save with `Ctrl+O`, exit with `Ctrl+X`.

If you already used `MASTER_PASSWORD` in an older `.env`, it still works as a fallback, but `ADMIN_PASSWORD` is preferred.

---

## Step 4 — Copy `docker-compose.yml` to the VPS

From your local machine (or just create it on the VPS):

```bash
# Option A — from your local machine
scp docker-compose.yml root@YOUR_VPS_IP:/opt/fratelanza/

# Option B — paste it directly on the VPS
nano /opt/fratelanza/docker-compose.yml
# paste the contents of docker-compose.yml, then save
```

---

## Step 5 — Log in to GitHub Container Registry

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u Refaat1942 --password-stdin
```

---

## Step 6 — Pull images and start

```bash
cd /opt/fratelanza
docker compose pull
docker compose up -d
```

Check everything started:

```bash
docker compose ps
```

You should see `fratelanza-console-db`, `fratelanza-console-api`, and `fratelanza-console-web` all with status **Up**.

If `docker compose pull` fails with `pull access denied` or `denied: permission_denied`, your GitHub token cannot read the GHCR package. Create a GitHub personal access token with `read:packages`, then log in again:

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
docker compose pull
```

If `docker compose up -d` says `set ADMIN_PASSWORD or MASTER_PASSWORD in .env`, open `/opt/fratelanza/.env` and add `ADMIN_PASSWORD=your_app_login_password`.

---

## Step 7 — Set up your domain with Nginx

Install nginx on the host if not already there:

```bash
apt install nginx -y
```

Copy the vhost config:

```bash
nano /etc/nginx/sites-available/fratelanza
```

Paste the contents of `nginx-vhost.conf`, but **replace** `fratelanza.yourdomain.com` with your actual domain or subdomain.

Enable it:

```bash
ln -s /etc/nginx/sites-available/fratelanza /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## Step 8 — (Optional) Add HTTPS with Let's Encrypt

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d fratelanza.yourdomain.com
```

---

## Step 9 — Verify the app is running

Open your domain in a browser. You should see the Fratelanza login screen.

Default login username/password: the `ADMIN_USERNAME` and `ADMIN_PASSWORD` values from `.env`

---

## Updating to a new version

```bash
cd /opt/fratelanza
docker compose pull
docker compose up -d
docker image prune -f
```

---

## Useful commands

```bash
# View logs
docker compose logs -f api
docker compose logs -f web

# Stop the app
docker compose down

# Stop and delete the database (DANGER — data is lost)
docker compose down -v

# Restart just the API
docker compose restart api

# See why a container failed
docker compose ps
docker compose logs --tail=200 api
docker compose logs --tail=200 web
```

---

## Port reference (safe with other projects)

| Service | Host port | Internal port |
|---------|-----------|---------------|
| Web (nginx) | 127.0.0.1:3100 | 80 |
| API (express) | 127.0.0.1:3101 | 8080 |
| Database | not exposed | 5432 |

Ports 3100 and 3101 are only accessible from localhost — your host nginx proxies public traffic to them.
