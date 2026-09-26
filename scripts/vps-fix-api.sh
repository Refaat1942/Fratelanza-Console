#!/usr/bin/env bash
# Full deploy / repair of the Fratelanza Console on the Hostinger VPS — run as root.
#
#   bash /opt/fratelanza-console/source/scripts/vps-fix-api.sh            # deploy main
#   BRANCH=some-branch bash /opt/fratelanza-console/source/scripts/vps-fix-api.sh
#
# Order: pull code -> backup DB -> migrate -> build API + web -> restart -> verify.
set -euo pipefail

APP_DIR="/opt/fratelanza-console"
REPO_DIR="$APP_DIR/source"
ENV_FILE="$APP_DIR/.env"
BRANCH="${BRANCH:-main}"

echo "=========================================="
echo " Fratelanza Console — deploy / API repair"
echo "=========================================="

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing $ENV_FILE"
  exit 1
fi
if [[ ! -f "$APP_DIR/docker-compose.yml" ]]; then
  echo "ERROR: Missing $APP_DIR/docker-compose.yml"
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

# 1) Pull code first, then re-run the freshly pulled copy of this script so
#    every later step (migrations included) comes from the new code.
if [[ "${FC_SOURCE_PULLED:-}" != "1" ]]; then
  echo ""
  echo "==> Pulling latest source (branch: $BRANCH)..."
  git -C "$REPO_DIR" fetch origin "$BRANCH"
  git -C "$REPO_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
  git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
  export FC_SOURCE_PULLED=1 BRANCH
  exec bash "$REPO_DIR/scripts/vps-fix-api.sh"
fi

# shellcheck source=vps-deploy-lib.sh
source "$REPO_DIR/scripts/vps-deploy-lib.sh"
COMMIT=$(git -C "$REPO_DIR" rev-parse --short HEAD)
echo "==> Source commit: $COMMIT (v$EXPECTED_VERSION)"

echo ""
echo "==> Last API logs (before rebuild):"
docker logs fratelanza-console-api --tail 20 2>&1 || echo "(container not found)"

# 2) Database: make sure it is up, back it up, then migrate
echo ""
ensure_db_running
backup_db
run_migrations

# 3) Build images / static files
echo ""
build_api_image
build_web_static

# 4) Restart containers and serve the new frontend
echo ""
sync_host_nginx_static
restart_console_containers

# 5) Verify
echo ""
ok=1
verify_api_health || ok=0
verify_local_web || ok=0
verify_public_site || ok=0

echo ""
if [[ "$ok" -eq 1 ]]; then
  echo "=========================================="
  echo " DONE — commit $COMMIT (v$EXPECTED_VERSION live)"
  echo "=========================================="
else
  echo "=========================================="
  echo " DONE with WARNINGS — commit $COMMIT"
  echo " Run: bash $REPO_DIR/scripts/vps-diagnose.sh"
  echo "=========================================="
fi
echo "Hard-refresh the browser (Ctrl+Shift+R). Sidebar should show v$EXPECTED_VERSION."
docker ps --filter "name=fratelanza-console" --format "table {{.Names}}\t{{.Status}}"
[[ "$ok" -eq 1 ]]
