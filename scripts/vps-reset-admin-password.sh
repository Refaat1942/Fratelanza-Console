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

echo "==> Resetting password for user: ${ADMIN_USER,,}"

# Ensure users table has required columns
docker exec -i fratelanza-console-db psql -U fratelanza_console -d fratelanza_console \
  < "$APP_DIR/source/scripts/vps-migrate.sql" >/dev/null

hash_password() {
  docker run --rm fratelanza-console-api:local node --input-type=module -e "
    import bcrypt from 'bcryptjs';
    console.log(await bcrypt.hash(process.argv[1], 10));
  " "$ADMIN_PASS"
}

HASH=""
if docker ps --format '{{.Names}}' | grep -qx 'fratelanza-console-api'; then
  HASH=$(docker exec fratelanza-console-api node --input-type=module -e "
    import bcrypt from 'bcryptjs';
    console.log(await bcrypt.hash(process.argv[1], 10));
  " "$ADMIN_PASS" 2>/dev/null || true)
fi

if [[ -z "$HASH" ]] && docker image inspect fratelanza-console-api:local >/dev/null 2>&1; then
  echo "==> Using API image to hash password..."
  HASH=$(hash_password)
fi

if [[ -z "$HASH" ]]; then
  echo "==> Using temporary node container for bcrypt..."
  HASH=$(docker run --rm node:24-alpine sh -s "$ADMIN_PASS" <<'EOF'
set -e
PASS="$1"
mkdir -p /tmp/bcrypt-work && cd /tmp/bcrypt-work
npm init -y >/dev/null 2>&1
npm install bcryptjs@2.4.3 --silent
node -e 'require("bcryptjs").hash(process.argv[1], 10).then((h) => console.log(h))' "$PASS"
EOF
)
fi

if [[ -z "$HASH" ]]; then
  echo "ERROR: Could not generate password hash"
  exit 1
fi

docker exec -i fratelanza-console-db psql -U fratelanza_console -d fratelanza_console <<SQL
INSERT INTO users (username, password_hash, role, page_permissions)
VALUES (lower('$ADMIN_USER'), '$HASH', 'admin', '{}')
ON CONFLICT (username) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role = 'admin';
SQL

echo ""
echo "Done. Sign in with:"
echo "  Username: ${ADMIN_USER,,}"
echo "  Password: (value of ADMIN_PASSWORD in .env)"
echo ""
echo "If login still fails, run: bash $APP_DIR/source/scripts/vps-fix-api.sh"
