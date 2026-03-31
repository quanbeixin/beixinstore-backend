#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"

echo "[INFO] apply efficiency factor settings migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-31-efficiency-factor-settings-up.sql"

echo "[INFO] verify efficiency factor settings migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-31-efficiency-factor-settings-verify.sql"

echo "[DONE] efficiency factor settings migration applied."
