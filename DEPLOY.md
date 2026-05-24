# Manual Deployment - Hostinger VPS

This project is deployed as three Docker containers:

- `fratelanza-console-db` - PostgreSQL
- `fratelanza-console-api` - Express API on `127.0.0.1:3101`
- `fratelanza-console-web` - Vite static web app on `127.0.0.1:3100`

Host nginx proxies public traffic from your domain to those localhost ports.

## Recommended flow

1. Make your changes in Replit.
2. Push the changes to GitHub.
3. Run the GitHub Actions workflow named **Build & Deploy to Hostinger VPS**.
4. Open your domain and log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

The workflow builds fresh Docker images, pushes them to GitHub Container Registry, copies `docker-compose.yml` to the VPS, then runs `docker compose pull && docker compose up -d`.

## One-time VPS setup

SSH into Hostinger:

```bash
ssh root@YOUR_VPS_IP
```

Install Docker, Compose, and nginx if they are not installed:

```bash
apt update
apt install -y ca-certificates curl gnupg nginx
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Create the app directory:

```bash
mkdir -p /opt/fratelanza
cd /opt/fratelanza
```

Create `/opt/fratelanza/.env`:

```bash
nano /opt/fratelanza/.env
```

Paste and edit:

```env
POSTGRES_PASSWORD=choose_a_strong_database_password
SESSION_SECRET=choose_a_long_random_session_secret_32_chars_min
ADMIN_USERNAME=admin
ADMIN_PASSWORD=choose_your_login_password
REGISTRY=ghcr.io/refaat1942
IMAGE_TAG=latest
```

## GitHub repository secrets

Add these in GitHub: **Settings -> Secrets and variables -> Actions -> New repository secret**.

| Secret | Value |
|---|---|
| `VPS_HOST` | Your Hostinger VPS IP or hostname |
| `VPS_USER` | Usually `root` |
| `VPS_SSH_KEY` | Private SSH key that can log in to the VPS |
| `POSTGRES_PASSWORD` | Same value as the VPS `.env` |
| `SESSION_SECRET` | Same value as the VPS `.env` |
| `ADMIN_USERNAME` | Login username, for example `admin` |
| `ADMIN_PASSWORD` | Login password |

## First deploy

Run the **Build & Deploy to Hostinger VPS** workflow from GitHub Actions.

After it finishes, check the VPS:

```bash
cd /opt/fratelanza
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 web
```

You should see all services with status `Up`.

## Domain nginx config

Point your domain or subdomain DNS `A` record to the Hostinger VPS IP.

Create nginx config:

```bash
nano /etc/nginx/sites-available/fratelanza
```

Paste this, replacing `console.fratelanza.com` with your real domain:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name console.fratelanza.com;

    client_max_body_size 20M;

    location /api/ {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload nginx:

```bash
ln -sf /etc/nginx/sites-available/fratelanza /etc/nginx/sites-enabled/fratelanza
nginx -t
systemctl reload nginx
```

## HTTPS

The API uses secure cookies in production, so login works best over HTTPS.

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d console.fratelanza.com
```

Replace `console.fratelanza.com` with your real domain.

## Updating after Replit changes

From Replit:

```bash
git add .
git commit -m "Describe your change"
git push
```

Then run the GitHub Actions deploy workflow again.

## Manual VPS commands

```bash
cd /opt/fratelanza

# Pull the latest images and restart
docker compose pull
docker compose up -d --remove-orphans

# Logs
docker compose logs -f api
docker compose logs -f web

# Restart one service
docker compose restart api

# Stop the app
docker compose down
```

## Troubleshooting

### `docker compose pull` fails with unauthorized

Log in to GitHub Container Registry on the VPS with a GitHub token that has package read access:

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### Containers start but the website is blank

Check that the `web` service is using the `fratelanza-web` image:

```bash
docker compose ps
docker inspect fratelanza-console-web --format '{{.Config.Image}}'
```

### Login does not stay logged in

Make sure HTTPS is enabled and your nginx config sends:

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

### API errors on startup

Check the API logs:

```bash
docker compose logs --tail=200 api
```

Common causes are missing `SESSION_SECRET`, missing `ADMIN_PASSWORD`, or an incorrect `POSTGRES_PASSWORD`.
