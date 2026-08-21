#!/usr/bin/env bash
# Fix API down (502 on /api/*) — run on Hostinger VPS as root.
set -euo pipefail

APP_DIR="/opt/fratelanza-console"
ENV_FILE="$APP_DIR/.env"

echo "=========================================="
echo " Fratelanza Console — API repair"
echo "=========================================="

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

missing=0
for key in POSTGRES_PASSWORD SESSION_SECRET ADMIN_PASSWORD; do
  if [[ -z "${!key:-}" ]]; then
    echo "ERROR: $key is not set in $ENV_FILE"
    missing=1
  fi
done
[[ "$missing" -eq 0 ]] || exit 1

echo ""
echo "==> Running DB migrate (users/session columns)..."
if docker ps --format '{{.Names}}' | grep -qx 'fratelanza-console-db'; then
  docker exec -i fratelanza-console-db psql -U fratelanza_console -d fratelanza_console \
    < "$APP_DIR/source/scripts/vps-migrate.sql"
else
  echo "WARN: DB container not running — starting db..."
  docker compose -f "$APP_DIR/docker-compose.yml" up -d db
  sleep 5
  docker exec -i fratelanza-console-db psql -U fratelanza_console -d fratelanza_console \
    < "$APP_DIR/source/scripts/vps-migrate.sql"
fi

echo ""
echo "==> Last API logs:"
docker logs fratelanza-console-api --tail 40 2>&1 || echo "(container not found)"

echo ""
echo "==> Recreating API container..."
docker compose -f "$APP_DIR/docker-compose.yml" up -d --force-recreate api

echo "==> Waiting for API..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf --max-time 3 http://127.0.0.1:3101/api/healthz >/dev/null 2>&1; then
    echo "    API healthz OK on attempt $i"
    curl -sf http://127.0.0.1:3101/api/healthz
    echo ""
    exit 0
  fi
  sleep 2
done

echo ""
echo "ERROR: API still not responding on :3101"
echo "Check: docker logs fratelanza-console-api --tail 80"
exit 1
