#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"

echo "[INFO] apply demand scoring migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-04-23-demand-scoring-up.sql"
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-06-15-demand-score-decline-up.sql"

echo "[INFO] verify demand scoring migration..."
node "$NODE_RUNNER" "$SCRIPT_DIR/2026-04-23-demand-scoring-verify.sql"

echo "[DONE] demand scoring migration applied."
