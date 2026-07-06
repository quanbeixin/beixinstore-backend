#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-06-matrix-packages-up.sql
