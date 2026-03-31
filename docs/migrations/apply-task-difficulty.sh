#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"

echo "[INFO] apply task difficulty migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-31-task-difficulty-up.sql"

echo "[INFO] verify task difficulty migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-31-task-difficulty-verify.sql"

echo "[DONE] task difficulty migration applied."
