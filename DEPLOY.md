# Hostinger VPS Deployment

This guide deploys Fratelanza alongside your other projects without touching them.

## How it's isolated

- All containers are prefixed with `fratelanza-console` (set by `name: fratelanza-console` in compose)
- The web container binds to port **3100** on localhost only (`127.0.0.1:3100`)
- The API container binds to port **3101** on localhost only (`127.0.0.1:3101`)
- The database has its own named volume `fratelanza_console_pgdata`
- Your other projects are completely unaffected

---

## Recommended flow from Replit to Hostinger

1. Push your Replit changes to GitHub.
2. Run the GitHub Actions workflow **Build & Deploy to Hostinger VPS**.
3. The workflow builds Docker images, pushes them to GitHub Container Registry (GHCR), SSHs into the VPS, then runs `docker compose pull && docker compose up -d`.

Use the manual steps below if you want to deploy from the VPS yourself.

---

## Step 1 — SSH into your VPS

```bash
ssh root@YOUR_VPS_IP
```

---

## Step 2 — Create project folder

```bash
apt update
apt install -y docker.io docker-compose-plugin nginx
systemctl enable --now docker

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

The compose file pulls these images:

- `${REGISTRY}/fratelanza-api:${IMAGE_TAG}`
- `${REGISTRY}/fratelanza-web:${IMAGE_TAG}`

---

## Step 5 — Log in to GitHub Container Registry

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

If the package is private, the token needs `read:packages` permission.

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

You should see `fratelanza-db`, `fratelanza-api`, and `fratelanza-web` all with status **Up**.

---

## Step 7 — Set up your domain with Nginx

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

Login with `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `.env`.

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
docker compose logs -f
docker compose logs -f api
docker compose logs -f web

# Confirm rendered config/env values
docker compose config

# Confirm local-only ports
ss -lntp | grep -E '3100|3101'

# Stop the app
docker compose down

# Stop and delete the database (DANGER — data is lost)
docker compose down -v

# Restart just the API
docker compose restart api
```

---

## Port reference (safe with other projects)

| Service | Host port | Internal port |
|---------|-----------|---------------|
| Web (nginx) | 127.0.0.1:3100 | 80 |
| API (express) | 127.0.0.1:3101 | 8080 |
| Database | not exposed | 5432 |

Ports 3100 and 3101 are only accessible from localhost — your host nginx proxies public traffic to them.
