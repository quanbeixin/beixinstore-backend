#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$BACKEND_DIR/.env"
NODE_RUNNER="$SCRIPT_DIR/run-sql-with-mysql2.js"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[ERROR] .env file not found at: $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${DB_HOST:?DB_HOST is required in .env}"
: "${DB_USER:?DB_USER is required in .env}"
: "${DB_PASSWORD:?DB_PASSWORD is required in .env}"
: "${DB_NAME:?DB_NAME is required in .env}"
DB_PORT="${DB_PORT:-3306}"

export MYSQL_PWD="$DB_PASSWORD"

UP_SQL="$SCRIPT_DIR/2026-03-28-project-management-v3-permission-hardening-up.sql"
VERIFY_SQL="$SCRIPT_DIR/2026-03-28-project-management-v3-permission-hardening-verify.sql"

if [[ ! -f "$UP_SQL" ]]; then
  echo "[ERROR] UP sql not found: $UP_SQL"
  exit 1
fi

if [[ ! -f "$VERIFY_SQL" ]]; then
  echo "[ERROR] VERIFY sql not found: $VERIFY_SQL"
  exit 1
fi

if [[ ! -f "$NODE_RUNNER" ]]; then
  echo "[ERROR] Node SQL runner not found: $NODE_RUNNER"
  exit 1
fi

run_with_node() {
  local sql_file="$1"
  node "$NODE_RUNNER" "$sql_file"
}

run_with_mysql_if_available() {
  local sql_file="$1"
  local label="$2"

  if ! command -v mysql >/dev/null 2>&1; then
    echo "[WARN] mysql client not found, fallback to node/mysql2: $label"
    run_with_node "$sql_file"
    return 0
  fi

  echo "[INFO] Running with mysql client: $label"
  set +e
  mysql --protocol=TCP -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" < "$sql_file"
  local mysql_exit=$?
  set -e

  if [[ "$mysql_exit" -ne 0 ]]; then
    echo "[WARN] mysql client failed (exit $mysql_exit), fallback to node/mysql2: $label"
    run_with_node "$sql_file"
  fi
}

run_with_mysql_if_available "$UP_SQL" "$(basename "$UP_SQL")"
run_with_mysql_if_available "$VERIFY_SQL" "$(basename "$VERIFY_SQL")"

echo "[DONE] Permission hardening applied and verified successfully."
