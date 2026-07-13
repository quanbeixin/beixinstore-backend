#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-13-app-version-releases-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-13-app-release-manager-role-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-13-app-version-release-multi-record-up.sql
