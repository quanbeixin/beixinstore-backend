#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"
UP_SQL="$SCRIPT_DIR/2026-04-13-bug-multi-assignees-up.sql"
VERIFY_SQL="$SCRIPT_DIR/2026-04-13-bug-multi-assignees-verify.sql"

if [[ ! -f "$NODE_RUNNER" ]]; then
  echo "[ERROR] Node SQL runner not found: $NODE_RUNNER"
  exit 1
fi

if [[ ! -f "$UP_SQL" ]]; then
  echo "[ERROR] UP sql not found: $UP_SQL"
  exit 1
fi

if [[ ! -f "$VERIFY_SQL" ]]; then
  echo "[ERROR] VERIFY sql not found: $VERIFY_SQL"
  exit 1
fi

node "$NODE_RUNNER" "$UP_SQL"
node "$NODE_RUNNER" "$VERIFY_SQL"

echo "[DONE] Bug multi-assignees migration applied and verified successfully."
