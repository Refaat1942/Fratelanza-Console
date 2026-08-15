#!/usr/bin/env bash
# One-shot update for console.fratelanza.com — paste entire script in Hostinger VPS terminal.
set -euo pipefail

APP_DIR="/opt/fratelanza-console"
REPO_DIR="$APP_DIR/source"
REPO_URL="https://github.com/Refaat1942/Fratelanza-Console.git"

echo "=========================================="
echo " Fratelanza Console — force update"
echo "=========================================="

if [[ ! -d "$APP_DIR" ]]; then
  echo "ERROR: $APP_DIR not found. Create it first."
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
echo "==> Source commit: $COMMIT (expect 676641e or newer)"

echo "==> Building WEB (frontend)..."
docker build -f "$REPO_DIR/Dockerfile.web" -t fratelanza-console-web:build "$REPO_DIR"

echo "==> Copying web files to web-static..."
docker rm -f fc-web-extract 2>/dev/null || true
docker create --name fc-web-extract fratelanza-console-web:build
rm -rf "${APP_DIR:?}/web-static"/*
docker cp fc-web-extract:/usr/share/nginx/html/. "$APP_DIR/web-static/"
docker rm fc-web-extract

echo "==> Building API..."
docker build -f "$REPO_DIR/Dockerfile.api" -t fratelanza-console-api:local "$REPO_DIR"

echo "==> Restarting containers..."
docker restart fratelanza-console-web 2>/dev/null || docker compose -f "$APP_DIR/docker-compose.yml" up -d web
docker restart fratelanza-console-api 2>/dev/null || docker compose -f "$APP_DIR/docker-compose.yml" up -d api

echo ""
echo "=========================================="
echo " DONE — commit $COMMIT deployed"
echo "=========================================="
echo ""
echo "Verify in browser (incognito or Ctrl+Shift+R):"
echo "  1. Open New Quote"
echo "  2. Look for: Engine 2026.08.15-c"
echo "  3. Upload PDF — should work without 404"
echo ""
docker ps --filter "name=fratelanza-console" --format "table {{.Names}}\t{{.Status}}"
