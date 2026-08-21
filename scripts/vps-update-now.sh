#!/usr/bin/env bash
# One-shot update for console.fratelanza.com — paste in Hostinger VPS terminal.
set -euo pipefail

APP_DIR="/opt/fratelanza-console"
REPO_DIR="$APP_DIR/source"
REPO_URL="https://github.com/Refaat1942/Fratelanza-Console.git"
EXPECTED_VERSION="2026.08.21-b"

echo "=========================================="
echo " Fratelanza Console — deploy + migrate"
echo "=========================================="

if [[ ! -d "$APP_DIR" ]]; then
  echo "ERROR: $APP_DIR not found. Run DEPLOY.md setup first."
  exit 1
fi

mkdir -p "$APP_DIR/web-static" "$REPO_DIR"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "==> Cloning repo..."
  git clone "$REPO_URL" "$REPO_DIR"
fi

echo "==> Pulling latest main..."
git -C "$REPO_DIR" fetch origin main
git -C "$REPO_DIR" checkout main
git -C "$REPO_DIR" reset --hard origin/main

COMMIT=$(git -C "$REPO_DIR" rev-parse --short HEAD)
echo "==> Source commit: $COMMIT"

# shellcheck source=vps-deploy-lib.sh
source "$REPO_DIR/scripts/vps-deploy-lib.sh"

echo "==> DB migrate (new tables/columns)..."
if docker ps --format '{{.Names}}' | grep -qx 'fratelanza-console-db'; then
  docker exec -i fratelanza-console-db psql -U fratelanza_console -d fratelanza_console \
    < "$REPO_DIR/scripts/vps-migrate.sql"
  echo "==> DB migrate OK"
else
  echo "WARN: fratelanza-console-db not running — start with: cd $APP_DIR && docker compose up -d db"
  echo "      Then re-run this script."
  exit 1
fi

echo "==> Building WEB (no stale cache)..."
docker build --no-cache \
  --build-arg CACHEBUST="$COMMIT" \
  -f "$REPO_DIR/Dockerfile.web" \
  -t fratelanza-console-web:build \
  "$REPO_DIR"

echo "==> Copying web to web-static..."
docker rm -f fc-web-extract 2>/dev/null || true
docker create --name fc-web-extract fratelanza-console-web:build
rm -rf "${APP_DIR:?}/web-static"/*
docker cp fc-web-extract:/usr/share/nginx/html/. "$APP_DIR/web-static/"
docker rm fc-web-extract

verify_web_static

echo "==> Building API..."
docker build --no-cache -f "$REPO_DIR/Dockerfile.api" -t fratelanza-console-api:local "$REPO_DIR"

sync_host_nginx_static
restart_console_containers

echo ""
if verify_local_web && verify_public_site; then
  echo ""
  echo "=========================================="
  echo " DONE — commit $COMMIT (v$EXPECTED_VERSION live)"
  echo "=========================================="
else
  echo ""
  echo "=========================================="
  echo " DONE with WARNINGS — commit $COMMIT"
  echo " Run: bash $REPO_DIR/scripts/vps-diagnose.sh"
  echo "=========================================="
fi

echo ""
echo "Verify in browser (Ctrl+Shift+R or incognito):"
echo "  • Sidebar bottom shows: v$EXPECTED_VERSION"
echo "  • Projects: Freelancers column + client dropdown"
echo "  • Clients: Active switch + Export Excel"
echo "  • Freelancers: Download / Sync Excel"
echo ""
docker ps --filter "name=fratelanza-console" --format "table {{.Names}}\t{{.Status}}"
