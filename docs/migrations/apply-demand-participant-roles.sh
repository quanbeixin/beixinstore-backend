#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"

echo "[INFO] apply demand participant roles migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-30-demand-participant-roles-up.sql"

echo "[INFO] verify demand participant roles migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-30-demand-participant-roles-verify.sql"

echo "[DONE] demand participant roles migration applied."
