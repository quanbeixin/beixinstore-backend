#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"

echo "[INFO] apply user change logs migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-30-user-change-logs-up.sql"

echo "[INFO] verify user change logs migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-30-user-change-logs-verify.sql"

echo "[DONE] user change logs migration applied."
