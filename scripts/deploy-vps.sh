#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fratelanza}"

cd "$APP_DIR"

echo ">> Pulling latest Fratelanza Console images"
docker compose pull
echo ">> Restarting containers"
docker compose up -d --remove-orphans
docker image prune -f
echo ">> Deploy complete"
