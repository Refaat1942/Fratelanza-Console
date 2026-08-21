#!/usr/bin/env bash
# Quick diagnosis for console.fratelanza.com serving stale frontend.
set -euo pipefail

APP_DIR="/opt/fratelanza-console"
PUBLIC_URL="${PUBLIC_URL:-https://console.fratelanza.com}"
EXPECTED_VERSION="${EXPECTED_VERSION:-2026.08.21-b}"

echo "=========================================="
echo " Fratelanza Console — deploy diagnosis"
echo "=========================================="
echo ""

echo "==> Git commit in source:"
git -C "$APP_DIR/source" rev-parse --short HEAD 2>/dev/null || echo "(no clone)"

echo ""
echo "==> web-static on disk:"
if [[ -d "$APP_DIR/web-static/assets" ]]; then
  ls -lt "$APP_DIR/web-static/assets/"*.js 2>/dev/null | head -3 || true
  if grep -rq "$EXPECTED_VERSION" "$APP_DIR/web-static/assets/" 2>/dev/null; then
    echo "    Contains v$EXPECTED_VERSION: YES"
  else
    echo "    Contains v$EXPECTED_VERSION: NO — re-run deploy script"
  fi
else
  echo "    MISSING $APP_DIR/web-static/assets"
fi

echo ""
echo "==> Docker containers:"
docker ps --filter "name=fratelanza-console" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true

echo ""
echo "==> localhost:3100 (docker web):"
HTML3100=$(curl -sf --max-time 5 http://127.0.0.1:3100/ 2>/dev/null || echo "")
if [[ -n "$HTML3100" ]]; then
  B3100=$(echo "$HTML3100" | grep -oE 'assets/index-[^"]+\.js' | head -1)
  echo "    bundle: ${B3100:-?}"
  LM3100=$(curl -sI --max-time 5 http://127.0.0.1:3100/ 2>/dev/null | grep -i last-modified || true)
  echo "    ${LM3100:-}"
else
  echo "    UNREACHABLE"
fi

echo ""
echo "==> Public site ($PUBLIC_URL):"
HTMLP=$(curl -sf --max-time 10 "$PUBLIC_URL/" 2>/dev/null || echo "")
if [[ -n "$HTMLP" ]]; then
  BP=$(echo "$HTMLP" | grep -oE 'assets/index-[^"]+\.js' | head -1)
  echo "    bundle: ${BP:-?}"
  curl -sI --max-time 10 "$PUBLIC_URL/" 2>/dev/null | grep -iE '^(last-modified|server|etag):' || true
  if [[ -n "$BP" ]] && curl -sf "$PUBLIC_URL/$BP" 2>/dev/null | grep -q "$EXPECTED_VERSION"; then
    echo "    v$EXPECTED_VERSION in JS: YES — site is up to date"
  else
    echo "    v$EXPECTED_VERSION in JS: NO — host nginx likely serves a different root"
  fi
else
  echo "    UNREACHABLE"
fi

echo ""
echo "==> Host nginx configs mentioning console.fratelanza.com:"
grep -R --line-number -E 'server_name|root |proxy_pass|console\.fratelanza' /etc/nginx/sites-enabled/ 2>/dev/null || echo "(none or no access)"

echo ""
echo "Done."
