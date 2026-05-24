# Manual Deployment — Hostinger VPS

This guide deploys Fratelanza from GitHub Container Registry (GHCR) to a Hostinger VPS. It is safe to run alongside other projects on the same VPS.

## How it is isolated

- Compose project name is `fratelanza-console`.
- Containers are named `fratelanza-console-db`, `fratelanza-console-api`, and `fratelanza-console-web`.
- The web container binds to port **3100** on localhost only (`127.0.0.1:3100`).
- The API container binds to port **3101** on localhost only (`127.0.0.1:3101`).
- The database has its own named volume `fratelanza_console_pgdata`.
- Public traffic goes through the host Nginx reverse proxy.

---

## Step 1 — Push your Replit changes to GitHub

The VPS pulls Docker images from GHCR. After making changes in Replit, commit and push them to the GitHub repository, then run the GitHub Actions workflow named **Build & Deploy to Hostinger VPS**.

The workflow builds:

- `ghcr.io/refaat1942/fratelanza-api:<tag>`
- `ghcr.io/refaat1942/fratelanza-web:<tag>`

It then copies `docker-compose.yml` to the VPS and restarts the containers.

---

## Step 2 — SSH into your VPS

```bash
ssh root@YOUR_VPS_IP
```

---

## Step 3 — Install Docker and Nginx on the VPS

Run this once on a fresh Ubuntu VPS:

```bash
apt update
apt install -y ca-certificates curl gnupg nginx
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker nginx
docker --version
docker compose version
```

---

## Step 4 — Create the project folder

```bash
mkdir -p /opt/fratelanza
cd /opt/fratelanza
```

---

## Step 5 — Create your `.env` file

```bash
nano .env
```

Paste and fill in:

```env
POSTGRES_PASSWORD=choose_a_strong_database_password
SESSION_SECRET=any_long_random_string_here_32_chars_min
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_app_login_password
REGISTRY=ghcr.io/refaat1942
IMAGE_TAG=latest
```

Save with `Ctrl+O`, exit with `Ctrl+X`.

Important:

- Use `ADMIN_PASSWORD`, not `MASTER_PASSWORD`.
- `ADMIN_PASSWORD` is used to create the first admin user when the database is empty.
- If you already deployed once, changing `ADMIN_PASSWORD` does not change an existing user password in the database.

---

## Step 6 — Copy `docker-compose.yml` to the VPS

From your local machine or Replit shell:

```bash
scp docker-compose.yml root@YOUR_VPS_IP:/opt/fratelanza/
```

Or paste it directly on the VPS:

```bash
nano /opt/fratelanza/docker-compose.yml
# paste the contents of docker-compose.yml, then save
```

---

## Step 7 — Log in to GitHub Container Registry

If the GHCR packages are private, create a GitHub token with package read access, then run:

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

If the images are public, this step can be skipped.

---

## Step 8 — Pull images and start

```bash
cd /opt/fratelanza
docker compose pull
docker compose up -d
```

Check everything started:

```bash
docker compose ps
```

You should see `fratelanza-console-db`, `fratelanza-console-api`, and `fratelanza-console-web` with status **Up**.

---

## Step 9 — Set up your domain with Nginx

Create the vhost config:

```bash
nano /etc/nginx/sites-available/fratelanza
```

Paste the contents of `nginx-vhost.conf`, but replace `fratelanza.yourdomain.com` with your real domain or subdomain.

Enable it:

```bash
ln -sf /etc/nginx/sites-available/fratelanza /etc/nginx/sites-enabled/fratelanza
nginx -t
systemctl reload nginx
```

Also point your domain DNS A record to the VPS IP in Hostinger.

---

## Step 10 — Add HTTPS with Let's Encrypt

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d fratelanza.yourdomain.com
```

Replace `fratelanza.yourdomain.com` with your real domain.

---

## Step 11 — Verify the app is running

Open your domain in a browser. You should see the Fratelanza login screen.

Login with:

- Username: the `ADMIN_USERNAME` value from `.env`
- Password: the `ADMIN_PASSWORD` value from `.env`

---

## Updating to a new version

After pushing new changes and building new images:

```bash
cd /opt/fratelanza
docker compose pull
docker compose up -d
docker image prune -f
```

If you use the GitHub Actions deploy workflow, it runs these commands for you.

---

## Useful commands

```bash
# View logs
docker compose logs -f api
docker compose logs -f web
docker compose logs -f db

# Check health/status
docker compose ps
curl -i http://127.0.0.1:3101/api/healthz
curl -i http://127.0.0.1:3100

# Restart services
docker compose restart api
docker compose restart web

# Stop the app
docker compose down

# Stop and delete the database (DANGER: data is lost)
docker compose down -v
```

---

## Common problems

### `pull access denied` or `unauthorized`

Run `docker login ghcr.io` again with a GitHub token that can read packages. Also confirm `.env` has:

```env
REGISTRY=ghcr.io/refaat1942
IMAGE_TAG=latest
```

### `ADMIN_PASSWORD` or `SESSION_SECRET` is missing

Edit `/opt/fratelanza/.env` and set all required values:

```bash
nano /opt/fratelanza/.env
docker compose up -d
```

### Domain opens but API calls fail

Check Nginx and API logs:

```bash
nginx -t
docker compose logs -f api
```

Make sure the Nginx vhost proxies `/api/` to `http://127.0.0.1:3101` and `/` to `http://127.0.0.1:3100`.

---

## Port reference

| Service               | Host port      | Internal port |
| --------------------- | -------------- | ------------- |
| Web (nginx container) | 127.0.0.1:3100 | 80            |
| API (Express)         | 127.0.0.1:3101 | 8080          |
| Database              | not exposed    | 5432          |

Ports 3100 and 3101 are only accessible from the VPS itself. The host Nginx proxy handles public HTTP/HTTPS traffic.
