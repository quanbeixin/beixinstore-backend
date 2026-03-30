#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"
UP_SQL="$SCRIPT_DIR/2026-03-29-bug-management-up.sql"
VERIFY_SQL="$SCRIPT_DIR/2026-03-29-bug-management-verify.sql"
PHASE_UP_SQL="$SCRIPT_DIR/2026-03-29-bug-issue-stage-up.sql"
PHASE_VERIFY_SQL="$SCRIPT_DIR/2026-03-29-bug-issue-stage-verify.sql"

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

if [[ ! -f "$PHASE_UP_SQL" ]]; then
  echo "[ERROR] issue_stage UP sql not found: $PHASE_UP_SQL"
  exit 1
fi

if [[ ! -f "$PHASE_VERIFY_SQL" ]]; then
  echo "[ERROR] issue_stage VERIFY sql not found: $PHASE_VERIFY_SQL"
  exit 1
fi

node "$NODE_RUNNER" "$UP_SQL"
node "$NODE_RUNNER" "$VERIFY_SQL"
node "$NODE_RUNNER" "$PHASE_UP_SQL"
node "$NODE_RUNNER" "$PHASE_VERIFY_SQL"

echo "[DONE] Bug management migration (including issue_stage) applied and verified successfully."
