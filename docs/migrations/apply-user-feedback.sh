#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"

echo "[INFO] apply user feedback migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-04-09-user-feedback-up.sql"

echo "[INFO] verify user feedback migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-04-09-user-feedback-verify.sql"

echo "[DONE] user feedback migration applied."
