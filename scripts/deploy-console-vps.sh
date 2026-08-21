#!/usr/bin/env bash
# Rebuild and redeploy ONLY the Fratelanza Management Console (fratelanza-console-*).
# Does not touch lotus_*, fratelanza_postgres, fratelanza-hub-*, etc.
set -euo pipefail

APP_DIR="/opt/fratelanza-console"
REPO_DIR="/opt/fratelanza-console/source"
REPO_URL="${REPO_URL:-https://github.com/Refaat1942/Fratelanza-Console.git}"
BRANCH="${BRANCH:-main}"
EXPECTED_VERSION="2026.08.21-b"

echo "==> Fratelanza Console deploy (isolated)"
echo "    APP_DIR=$APP_DIR"
echo "    REPO_DIR=$REPO_DIR"

if [[ ! -d "$APP_DIR" ]]; then
  echo "ERROR: APP_DIR not found: $APP_DIR"
  echo "Create it first: mkdir -p $APP_DIR/web-static"
  exit 1
fi

if [[ ! -f "$APP_DIR/docker-compose.yml" ]]; then
  echo "ERROR: $APP_DIR/docker-compose.yml not found"
  exit 1
fi

mkdir -p "$APP_DIR/web-static" "$REPO_DIR"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "==> Cloning repository to $REPO_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
else
  echo "==> Updating repository at $REPO_DIR"
  git -C "$REPO_DIR" fetch origin "$BRANCH"
  git -C "$REPO_DIR" checkout "$BRANCH"
  git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"
fi

COMMIT=$(git -C "$REPO_DIR" rev-parse --short HEAD)
echo "==> Git commit: $COMMIT"

# shellcheck source=vps-deploy-lib.sh
source "$REPO_DIR/scripts/vps-deploy-lib.sh"

if [[ -f "$REPO_DIR/scripts/vps-migrate.sql" ]] && docker ps --format '{{.Names}}' | grep -qx 'fratelanza-console-db'; then
  echo "==> DB migrate..."
  docker exec -i fratelanza-console-db psql -U fratelanza_console -d fratelanza_console \
    < "$REPO_DIR/scripts/vps-migrate.sql"
fi

echo "==> Building API image (fratelanza-console-api:local)"
docker build --no-cache -f "$REPO_DIR/Dockerfile.api" -t fratelanza-console-api:local "$REPO_DIR"

echo "==> Building web assets (no stale cache)"
docker build --no-cache --build-arg CACHEBUST="$COMMIT" -f "$REPO_DIR/Dockerfile.web" -t fratelanza-console-web:build "$REPO_DIR"
docker rm -f fc-web-extract 2>/dev/null || true
docker create --name fc-web-extract fratelanza-console-web:build
rm -rf "${APP_DIR:?}/web-static"/*
docker cp fc-web-extract:/usr/share/nginx/html/. "$APP_DIR/web-static/"
docker rm fc-web-extract
verify_web_static

sync_host_nginx_static
restart_console_containers

verify_local_web || true
verify_public_site || true

echo "==> Done. Hard-refresh the browser (Ctrl+Shift+R)."
echo "    Deployed branch: $BRANCH"
echo "    Git commit: $COMMIT"
echo "    Look for sidebar version: v$EXPECTED_VERSION"
docker ps --filter "name=fratelanza-console" --format "table {{.Names}}\t{{.Status}}"
