#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-06-matrix-packages-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-08-matrix-package-domain-info-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-09-matrix-package-app-id-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-08-matrix-package-production-nodes-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-08-matrix-package-production-node-meta-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-09-matrix-package-production-node-expected-delivery-datetime-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-21-matrix-package-delivering-label-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-21-matrix-package-delivery-platform-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-21-matrix-package-delivery-status-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-24-matrix-package-status-testing-up.sql
node docs/migrations/run-sql-with-mysql2.js docs/migrations/2026-07-24-matrix-package-product-acceptance-node-up.sql
