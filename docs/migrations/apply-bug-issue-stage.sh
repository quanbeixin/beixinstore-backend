#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"

echo "[INFO] apply issue_stage migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-29-bug-issue-stage-up.sql"

echo "[INFO] verify issue_stage migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-03-29-bug-issue-stage-verify.sql"

echo "[DONE] bug issue_stage migration applied."
