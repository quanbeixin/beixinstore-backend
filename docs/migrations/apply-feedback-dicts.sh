#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"

echo "[INFO] apply feedback dicts migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-04-09-feedback-dicts-up.sql"

echo "[INFO] verify feedback dicts migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-04-09-feedback-dicts-verify.sql"

echo "[DONE] feedback dicts migration applied."
