# Deployment — Hostinger VPS

This app runs as three Docker services on the VPS:

- `db`: PostgreSQL 16 with its own named volume, `fratelanza_console_pgdata`
- `api`: Express API image from GHCR, bound to `127.0.0.1:3101`
- `web`: Vite static site served by nginx, bound to `127.0.0.1:3100`

The public domain is served by the host-level nginx config in `nginx-vhost.conf`.

## 1. Build and publish images

The GitHub Actions workflow `.github/workflows/deploy.yml` builds these images:

- `${REGISTRY}/fratelanza-api:${IMAGE_TAG}`
- `${REGISTRY}/fratelanza-web:${IMAGE_TAG}`

For normal deployment from Replit, push your Replit changes to GitHub, then run the **Build & Deploy to Hostinger VPS** workflow from GitHub Actions.

Required GitHub repository secrets:

| Secret | Description |
|---|---|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | SSH username, usually `root` |
| `VPS_SSH_KEY` | Private SSH key that can access the VPS |
| `POSTGRES_PASSWORD` | Strong database password |
| `SESSION_SECRET` | Long random Express session secret |
| `ADMIN_USERNAME` | Initial admin username, for example `admin` |
| `ADMIN_PASSWORD` | Initial admin password |

## 2. First-time VPS setup

SSH into the VPS:

```bash
ssh root@YOUR_VPS_IP
```

Install Docker, Compose, and nginx if they are not installed yet:

```bash
apt update
apt install -y docker.io docker-compose-plugin nginx
systemctl enable --now docker nginx
```

Create the app folder:

```bash
mkdir -p /opt/fratelanza
cd /opt/fratelanza
```

Copy `docker-compose.yml` and `nginx-vhost.conf` from this repo to `/opt/fratelanza` on the VPS.

Example from your local machine:

```bash
scp docker-compose.yml nginx-vhost.conf root@YOUR_VPS_IP:/opt/fratelanza/
```

## 3. Create the VPS `.env`

On the VPS:

```bash
cd /opt/fratelanza
nano .env
```

Paste and edit:

```dotenv
POSTGRES_PASSWORD=choose_a_strong_password
SESSION_SECRET=use_openssl_rand_hex_32_or_longer
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_app_login_password
REGISTRY=ghcr.io/refaat1942
IMAGE_TAG=latest
```

You can generate secrets with:

```bash
openssl rand -hex 32
```

If the GHCR images are private, log in on the VPS before pulling:

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

## 4. Start the app

```bash
cd /opt/fratelanza
docker compose --env-file .env pull
docker compose --env-file .env up -d --remove-orphans
docker compose ps
```

Expected services:

- `fratelanza-console-db`
- `fratelanza-console-api`
- `fratelanza-console-web`

Check the API from the VPS:

```bash
curl -f http://127.0.0.1:3101/api/healthz
```

## 5. Set up the public domain

Edit the vhost and replace `fratelanza.yourdomain.com` with your real domain or subdomain:

```bash
cp /opt/fratelanza/nginx-vhost.conf /etc/nginx/sites-available/fratelanza
nano /etc/nginx/sites-available/fratelanza
ln -sf /etc/nginx/sites-available/fratelanza /etc/nginx/sites-enabled/fratelanza
nginx -t
systemctl reload nginx
```

Add HTTPS:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d YOUR_DOMAIN
```

Open your domain in a browser. Log in with `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

## Updating after new Replit changes

1. Push the Replit changes to GitHub.
2. Run the GitHub Actions deploy workflow, or SSH to the VPS and run:

```bash
cd /opt/fratelanza
docker compose --env-file .env pull
docker compose --env-file .env up -d --remove-orphans
docker image prune -f
```

## Useful commands

```bash
# View logs
docker compose logs -f api
docker compose logs -f web
docker compose logs -f db

# Restart one service
docker compose restart api

# Stop the app, keeping the database volume
docker compose down

# Stop and delete the database volume. This deletes data.
docker compose down -v
```

## Port reference

| Service | Host port | Container port |
|---|---:|---:|
| Web | `127.0.0.1:3100` | `80` |
| API | `127.0.0.1:3101` | `8080` |
| Database | Not exposed | `5432` |

Ports `3100` and `3101` are localhost-only. Public traffic should enter through host nginx.
