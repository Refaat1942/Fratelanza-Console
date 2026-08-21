#!/usr/bin/env bash
# Shared helpers for Hostinger VPS deploy scripts.
# Source from vps-update-now.sh / deploy-console-vps.sh — do not run directly.

: "${APP_DIR:=/opt/fratelanza-console}"
: "${EXPECTED_VERSION:=2026.08.21-b}"
: "${PUBLIC_URL:=https://console.fratelanza.com}"

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
