#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"
UP_SQL="$SCRIPT_DIR/2026-03-30-job-level-and-department-efficiency-up.sql"
VERIFY_SQL="$SCRIPT_DIR/2026-03-30-job-level-and-department-efficiency-verify.sql"

if [[ ! -f "$NODE_RUNNER" ]]; then
  echo "[ERROR] Node SQL runner not found: $NODE_RUNNER"
  exit 1
fi

node "$NODE_RUNNER" "$UP_SQL"
node "$NODE_RUNNER" "$VERIFY_SQL"

echo "[DONE] Job level migration applied and verified successfully."
