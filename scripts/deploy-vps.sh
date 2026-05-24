#!/usr/bin/env bash
set -euo pipefail

BUILD_URL="${BUILD_URL:-https://8ddc433f-ed55-43c5-a767-d07292f0585f-00-ts7yqfyrbybl.worf.replit.dev/api/public/build.tar.gz}"
APP_DIR="/opt/fratelanza-console"
STATIC_DIR="$APP_DIR/web-static"
TMP_TAR="/tmp/fratelanza-build.tar.gz"

echo ">> Downloading build from $BUILD_URL"
curl -fsSL "$BUILD_URL" -o "$TMP_TAR"
echo ">> Size: $(du -h "$TMP_TAR" | cut -f1)"

echo ">> Replacing $STATIC_DIR"
mkdir -p "$STATIC_DIR"
rm -rf "${STATIC_DIR:?}"/*
tar -xzf "$TMP_TAR" -C "$STATIC_DIR"
rm -f "$TMP_TAR"

echo ">> Done. Hard-refresh console.fratelanza.com (Ctrl+Shift+R)."
