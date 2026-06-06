#!/usr/bin/env bash
# Rebuild and redeploy ONLY the Fratelanza Management Console (fratelanza-console-*).
# Does not touch lotus_*, fratelanza_postgres, fratelanza-hub-*, etc.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fratelanza-console}"
REPO_DIR="${REPO_DIR:-/opt/fratelanza-console-src}"
REPO_URL="${REPO_URL:-https://github.com/Refaat1942/Fratelanza-Console.git}"
BRANCH="${BRANCH:-main}"

echo "==> Fratelanza Console deploy (isolated)"
echo "    APP_DIR=$APP_DIR"
echo "    REPO_DIR=$REPO_DIR"

if [[ ! -d "$APP_DIR" ]]; then
  echo "ERROR: APP_DIR not found: $APP_DIR"
  echo "Set APP_DIR to the folder that contains docker-compose.yml and web-static/"
  exit 1
fi

if [[ ! -f "$APP_DIR/docker-compose.yml" ]]; then
  echo "ERROR: $APP_DIR/docker-compose.yml not found"
  exit 1
fi

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "==> Cloning repository"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
else
  echo "==> Updating repository"
  git -C "$REPO_DIR" fetch origin "$BRANCH"
  git -C "$REPO_DIR" checkout "$BRANCH"
  git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"
fi

echo "==> Building API image (fratelanza-console-api:local)"
docker build -f "$REPO_DIR/Dockerfile.api" -t fratelanza-console-api:local "$REPO_DIR"

echo "==> Building web assets"
docker build -f "$REPO_DIR/Dockerfile.web" -t fratelanza-console-web:build "$REPO_DIR"
docker rm -f fc-web-extract 2>/dev/null || true
docker create --name fc-web-extract fratelanza-console-web:build
mkdir -p "$APP_DIR/web-static"
rm -rf "${APP_DIR:?}/web-static"/*
docker cp fc-web-extract:/usr/share/nginx/html/. "$APP_DIR/web-static/"
docker rm fc-web-extract

echo "==> Restarting ONLY console containers"
docker restart fratelanza-console-api
docker restart fratelanza-console-web

echo "==> Done. Hard-refresh the browser (Ctrl+Shift+R)."
docker ps --filter "name=fratelanza-console" --format "table {{.Names}}\t{{.Status}}"
