#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"

echo "[INFO] apply work log owner estimate required migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-31-work-log-owner-estimate-required-up.sql"

echo "[INFO] verify work log owner estimate required migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-31-work-log-owner-estimate-required-verify.sql"

echo "[DONE] work log owner estimate required migration applied."
