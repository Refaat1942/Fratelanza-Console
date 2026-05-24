#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fratelanza}"
ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$APP_DIR/docker-compose.yml" ]]; then
  echo "Missing $APP_DIR/docker-compose.yml" >&2
  echo "Copy docker-compose.yml to the VPS app directory before running this script." >&2
  exit 1
fi

if [[ ! -f "$APP_DIR/$ENV_FILE" ]]; then
  echo "Missing $APP_DIR/$ENV_FILE" >&2
  echo "Create it from .env.example before running this script." >&2
  exit 1
fi

cd "$APP_DIR"

echo ">> Pulling latest Fratelanza images"
docker compose --env-file "$ENV_FILE" pull

echo ">> Restarting services"
docker compose --env-file "$ENV_FILE" up -d --remove-orphans

echo ">> Removing unused images"
docker image prune -f

echo ">> Done. Check with: docker compose ps"
