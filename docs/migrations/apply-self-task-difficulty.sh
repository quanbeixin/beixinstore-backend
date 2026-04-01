#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"

echo "[INFO] apply self task difficulty migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-04-01-self-task-difficulty-up.sql"

echo "[INFO] verify self task difficulty migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-04-01-self-task-difficulty-verify.sql"

echo "[DONE] self task difficulty migration applied."
