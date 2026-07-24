#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-13-app-version-releases-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-13-app-release-manager-role-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-13-app-version-release-multi-record-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-14-app-version-release-related-demand-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-14-app-version-release-application-meta-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-17-app-version-release-previous-release-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-24-app-version-release-last-operation-up.sql
