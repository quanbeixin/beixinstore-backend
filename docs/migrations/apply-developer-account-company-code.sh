#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/run-sql-with-mysql2.js" "$SCRIPT_DIR/2026-07-29-developer-account-company-code-up.sql"
