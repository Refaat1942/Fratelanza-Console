#!/usr/bin/env bash
# Reset admin login password from ADMIN_PASSWORD in /opt/fratelanza-console/.env
set -euo pipefail

APP_DIR="/opt/fratelanza-console"
ENV_FILE="$APP_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

ADMIN_USER="${ADMIN_USERNAME:-admin}"
ADMIN_PASS="${ADMIN_PASSWORD:-}"

if [[ -z "$ADMIN_PASS" ]]; then
  echo "ERROR: Set ADMIN_PASSWORD in $ENV_FILE first, then re-run."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx 'fratelanza-console-db'; then
  echo "ERROR: fratelanza-console-db is not running"
  exit 1
fi

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

ESC_USER=$(sql_escape "${ADMIN_USER,,}")
ESC_PASS=$(sql_escape "$ADMIN_PASS")

echo "==> Resetting password for user: ${ADMIN_USER,,}"

# Ensure users table has required columns
docker exec -i fratelanza-console-db psql -U fratelanza_console -d fratelanza_console \
  < "$APP_DIR/source/scripts/vps-migrate.sql" >/dev/null

echo "==> Hashing password with PostgreSQL pgcrypto (no Node/bcryptjs needed)..."

docker exec -i fratelanza-console-db psql -U fratelanza_console -d fratelanza_console <<SQL
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (username, password_hash, role, page_permissions)
VALUES (
  lower('$ESC_USER'),
  crypt('$ESC_PASS', gen_salt('bf', 10)),
  'admin',
  '{}'
)
ON CONFLICT (username) DO UPDATE
  SET password_hash = crypt('$ESC_PASS', gen_salt('bf', 10)),
      role = 'admin';
SQL

echo ""
echo "Done. Sign in with:"
echo "  Username: ${ADMIN_USER,,}"
echo "  Password: (value of ADMIN_PASSWORD in .env)"
echo ""
echo "If login still fails, run: bash $APP_DIR/source/scripts/vps-fix-api.sh"
