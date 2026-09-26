#!/usr/bin/env bash
# Shared helpers for Hostinger VPS deploy scripts.
# Source from vps-update-now.sh / deploy-console-vps.sh — do not run directly.

: "${APP_DIR:=/opt/fratelanza-console}"
: "${REPO_DIR:=$APP_DIR/source}"
: "${PUBLIC_URL:=https://console.fratelanza.com}"
: "${DB_CONTAINER:=fratelanza-console-db}"

# Version the frontend is built with — read from source so it never goes stale.
source_console_version() {
  sed -nE 's/.*CONSOLE_VERSION = "([^"]+)".*/\1/p' \
    "$REPO_DIR/artifacts/fratelanza/src/lib/console-version.ts" 2>/dev/null | head -1
}
: "${EXPECTED_VERSION:=$(source_console_version)}"

# Fetch BRANCH and make the VPS checkout match it exactly (the VPS copy is deploy-only).
pull_source() {
  local branch="$1"
  echo "==> Pulling latest source (branch: $branch)..."
  git -C "$REPO_DIR" fetch origin "$branch"
  git -C "$REPO_DIR" checkout -B "$branch" "origin/$branch"
  git -C "$REPO_DIR" reset --hard "origin/$branch"
  EXPECTED_VERSION="$(source_console_version)"
  echo "==> Source commit: $(git -C "$REPO_DIR" rev-parse --short HEAD) (v$EXPECTED_VERSION)"
}

# Start the DB if needed and wait until it accepts connections.
ensure_db_running() {
  if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    echo "==> DB container not running — starting db..."
    docker compose -f "$APP_DIR/docker-compose.yml" up -d db
  fi
  for _ in $(seq 1 30); do
    if docker exec "$DB_CONTAINER" pg_isready -U fratelanza_console -d fratelanza_console >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "ERROR: $DB_CONTAINER did not become ready"
  return 1
}

# Compressed pg_dump before any migration; keeps the 10 most recent.
backup_db() {
  local dir="$APP_DIR/backups"
  local file
  file="$dir/fratelanza_console-$(date +%Y%m%d-%H%M%S).sql.gz"
  mkdir -p "$dir"
  echo "==> Backing up database -> $file"
  docker exec "$DB_CONTAINER" pg_dump -U fratelanza_console -d fratelanza_console | gzip > "$file"
  if [[ ! -s "$file" ]]; then
    echo "ERROR: backup is empty — aborting before migration"
    return 1
  fi
  ls -1t "$dir"/fratelanza_console-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
}

# Apply scripts/vps-migrate.sql; any SQL error aborts the deploy.
run_migrations() {
  echo "==> DB migrate..."
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U fratelanza_console -d fratelanza_console \
    < "$REPO_DIR/scripts/vps-migrate.sql"
  echo "==> DB migrate OK"
}

build_api_image() {
  echo "==> Building API image..."
  docker build --no-cache -f "$REPO_DIR/Dockerfile.api" -t fratelanza-console-api:local "$REPO_DIR"
}

# Build the frontend and copy it into web-static (bind-mounted by the web container).
build_web_static() {
  local commit
  commit=$(git -C "$REPO_DIR" rev-parse --short HEAD)
  echo "==> Building WEB (no stale cache)..."
  docker build --no-cache \
    --build-arg CACHEBUST="$commit" \
    -f "$REPO_DIR/Dockerfile.web" \
    -t fratelanza-console-web:build \
    "$REPO_DIR"
  echo "==> Copying web to web-static..."
  mkdir -p "$APP_DIR/web-static"
  docker rm -f fc-web-extract 2>/dev/null || true
  docker create --name fc-web-extract fratelanza-console-web:build >/dev/null
  rm -rf "${APP_DIR:?}/web-static"/*
  docker cp fc-web-extract:/usr/share/nginx/html/. "$APP_DIR/web-static/"
  docker rm fc-web-extract >/dev/null
  verify_web_static
}

verify_web_static() {
  local static_dir="$APP_DIR/web-static"
  if [[ ! -d "$static_dir/assets" ]]; then
    echo "ERROR: $static_dir/assets not found"
    return 1
  fi
  if ! grep -rq "$EXPECTED_VERSION" "$static_dir/assets/" 2>/dev/null; then
    echo "ERROR: Built web files do NOT contain v$EXPECTED_VERSION — aborting."
    ls -la "$static_dir/assets/" | head -5
    return 1
  fi
  echo "==> Web static verified (v$EXPECTED_VERSION found on disk)"
}

# Host nginx (Ubuntu) may serve static files from `root` instead of proxying to :3100.
# Sync web-static to every nginx root tied to console.fratelanza.com.
sync_host_nginx_static() {
  local static_src="$APP_DIR/web-static"
  local sites_dir="/etc/nginx/sites-enabled"
  local synced=0

  if [[ ! -d "$sites_dir" ]]; then
    echo "==> No $sites_dir — skipping host nginx static sync"
    return 0
  fi

  for conf in "$sites_dir"/*; do
    [[ -f "$conf" ]] || continue
    if ! grep -qE 'console\.fratelanza\.com' "$conf" 2>/dev/null; then
      continue
    fi

    if grep -qE 'proxy_pass\s+http://127\.0\.0\.1:3100' "$conf" 2>/dev/null \
      && ! grep -qE '^\s*root\s+' "$conf" 2>/dev/null; then
      echo "==> Host nginx ($conf): proxies / to :3100 — no static sync needed"
      continue
    fi

    local root_path=""
    root_path=$(
      awk '
        /server_name/ && /console\.fratelanza\.com/ { in_server=1 }
        in_server && /^[[:space:]]*root[[:space:]]+/ {
          gsub(/;/, "", $2); print $2; exit
        }
        in_server && /^[[:space:]]*}/ { in_server=0 }
      ' "$conf" 2>/dev/null || true
    )

    if [[ -z "$root_path" ]]; then
      # Common Hostinger/manual layout — fall back if directory exists
      for candidate in \
        "/var/www/console.fratelanza.com" \
        "/var/www/fratelanza-console" \
        "$APP_DIR/web-static"; do
        if [[ -d "$candidate" && "$candidate" != "$static_src" ]]; then
          root_path="$candidate"
          echo "==> Host nginx ($conf): inferred static root $root_path"
          break
        fi
      done
    fi

    if [[ -n "$root_path" && "$root_path" != "$static_src" ]]; then
      echo "==> Syncing web-static -> $root_path"
      mkdir -p "$root_path"
      rsync -a --delete "$static_src/" "$root_path/"
      synced=1
    elif [[ -n "$root_path" ]]; then
      echo "==> Host nginx root is web-static bind mount ($root_path) — OK"
    fi
  done

  if [[ "$synced" -eq 1 ]]; then
    if nginx -t 2>/dev/null; then
      systemctl reload nginx
      echo "==> Host nginx reloaded after static sync"
    else
      echo "WARN: nginx -t failed — reload skipped"
    fi
  fi
}

restart_console_containers() {
  local compose_file="$APP_DIR/docker-compose.yml"
  echo "==> Recreating console containers (pick up web-static + images)..."

  docker compose -f "$compose_file" up -d --force-recreate --no-deps web 2>/dev/null \
    || docker restart fratelanza-console-web

  docker compose -f "$compose_file" up -d --force-recreate --no-deps api 2>/dev/null \
    || docker restart fratelanza-console-api
}

bundle_from_html() {
  grep -oE 'assets/index-[^"'\'' ]+\.js' | head -1
}

verify_api_health() {
  echo "==> Checking http://127.0.0.1:3101/api/healthz ..."
  local i
  for i in $(seq 1 20); do
    if curl -sf --max-time 5 http://127.0.0.1:3101/api/healthz | grep -q '"status"'; then
      echo "    API healthz OK (attempt $i)"
      return 0
    fi
    sleep 3
  done
  docker logs fratelanza-console-api --tail 40 2>&1 || true
  echo "ERROR: API not responding (login will fail with 502)"
  echo "       Check: docker logs fratelanza-console-api --tail 80"
  return 1
}

verify_local_web() {
  echo "==> Checking http://127.0.0.1:3100/ ..."
  local html bundle
  html=$(curl -sf --max-time 10 http://127.0.0.1:3100/ 2>/dev/null || true)
  if [[ -z "$html" ]]; then
    echo "WARN: Could not reach localhost:3100"
    return 1
  fi
  bundle=$(printf '%s' "$html" | bundle_from_html)
  echo "    Local bundle: ${bundle:-unknown}"
  if [[ -n "$bundle" ]]; then
    if curl -sf "http://127.0.0.1:3100/$bundle" | grep -q "$EXPECTED_VERSION"; then
      echo "    Local :3100 contains v$EXPECTED_VERSION — OK"
      return 0
    fi
    echo "WARN: Local :3100 bundle missing v$EXPECTED_VERSION"
  fi
  return 1
}

verify_public_site() {
  echo "==> Checking $PUBLIC_URL ..."
  local html bundle lm
  html=$(curl -sf --max-time 15 "$PUBLIC_URL/" 2>/dev/null || true)
  if [[ -z "$html" ]]; then
    echo "WARN: Could not fetch $PUBLIC_URL"
    return 1
  fi
  lm=$(curl -sI --max-time 15 "$PUBLIC_URL/" 2>/dev/null | grep -i '^last-modified:' | tr -d '\r' || true)
  bundle=$(printf '%s' "$html" | bundle_from_html)
  echo "    Public bundle: ${bundle:-unknown}"
  [[ -n "$lm" ]] && echo "    $lm"

  if [[ -n "$bundle" ]] && curl -sf "$PUBLIC_URL/$bundle" | grep -q "$EXPECTED_VERSION"; then
    echo "==> PUBLIC SITE OK — v$EXPECTED_VERSION is live"
    return 0
  fi

  echo ""
  echo "ERROR: Public site is still serving an OLD build."
  echo "       Run on VPS:"
  echo "         grep -R 'root\\|proxy_pass' /etc/nginx/sites-enabled/"
  echo "         curl -s http://127.0.0.1:3100/ | grep assets/"
  echo "         ls -la $APP_DIR/web-static/assets/ | head"
  echo "       Then hard-refresh browser: Ctrl+Shift+R"
  return 1
}
