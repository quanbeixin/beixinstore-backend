# Project Management V1 Migration Guide

## Files

- `2026-03-28-project-management-v1-up.sql`
- `2026-03-28-project-management-v1-down.sql`
- `2026-03-28-project-management-v1-verify.sql`
- `apply-project-management-v1.sh`
- `rollback-project-management-v1.sh`
- `run-sql-with-mysql2.js`

## Scope

This migration introduces the first batch of project-management schema changes:

1. Extend `work_demands` with project-management fields.
2. Create `project_templates`, `task_collaborators`, `project_members`, `node_status_logs`, `notification_config`.
3. Extend `wf_process_instance_nodes`, `wf_process_tasks`, `work_logs`.

## Safety Notes

- Scripts are designed to be idempotent for existing tables/columns/indexes.
- For `wf_process_*` table alterations:
  - If workflow tables are absent in your environment, steps are skipped safely.
- `down.sql` drops newly created tables and new columns/indexes. Run only when rollback is required.
- Always take a full DB backup before running `up.sql` or `down.sql`.

## Suggested Runbook

1. Backup database.
2. Run `up.sql`.
3. Run `verify.sql` and keep output as release evidence.
4. If rollback needed, run `down.sql`.
5. Run `verify.sql` again to confirm rollback result.

## Example

```bash
mysql -h <host> -P <port> -u <user> -p <db_name> < 2026-03-28-project-management-v1-up.sql
mysql -h <host> -P <port> -u <user> -p <db_name> < 2026-03-28-project-management-v1-verify.sql
```

If local `mysql` client has auth-plugin issues, use the Node runner directly:

```bash
node backend/docs/migrations/run-sql-with-mysql2.js backend/docs/migrations/2026-03-28-project-management-v1-up.sql
node backend/docs/migrations/run-sql-with-mysql2.js backend/docs/migrations/2026-03-28-project-management-v1-verify.sql
```

## One-command Scripts

From repository root:

```bash
./backend/docs/migrations/apply-project-management-v1.sh
```

Rollback if needed:

```bash
./backend/docs/migrations/rollback-project-management-v1.sh
```

These scripts read DB connection from `backend/.env`.
They prefer `mysql` client and automatically fallback to `node + mysql2` runner if `mysql` is unavailable or fails.

## V2 Permission Migration

To decouple project template / notification config from `demand.view` and `demand.manage`, V2 adds:

- `project.template.view`
- `project.template.manage`
- `notification.config.view`
- `notification.config.manage`

Files:

- `2026-03-28-project-management-v2-permissions-up.sql`
- `2026-03-28-project-management-v2-permissions-down.sql`
- `2026-03-28-project-management-v2-permissions-verify.sql`
- `apply-project-management-v2-permissions.sh`
- `rollback-project-management-v2-permissions.sh`

Apply:

```bash
./backend/docs/migrations/apply-project-management-v2-permissions.sh
```

Rollback:

```bash
./backend/docs/migrations/rollback-project-management-v2-permissions.sh
```

## V3 Permission Hardening

V3 hardens permissions for project template / notification config:

- Restrict both `*.view` and `*.manage` to `ADMIN` + `SUPER_ADMIN`.
- Remove automatic broad grants from non-admin roles.

Files:

- `2026-03-28-project-management-v3-permission-hardening-up.sql`
- `2026-03-28-project-management-v3-permission-hardening-down.sql`
- `2026-03-28-project-management-v3-permission-hardening-verify.sql`
- `apply-project-management-v3-permission-hardening.sh`
- `rollback-project-management-v3-permission-hardening.sh`

Apply:

```bash
./backend/docs/migrations/apply-project-management-v3-permission-hardening.sh
```

Rollback:

```bash
./backend/docs/migrations/rollback-project-management-v3-permission-hardening.sh
```

## Smoke Check

Run project-management smoke checks (read-only checks against current DB data):

```bash
node backend/scripts/smoke-project-management-v2.js
```

This script verifies:

- DB connectivity
- project template list/detail query
- notification config scenes
- V2 permission codes and role bindings
- demand member query
- archived demand list query

## Demo Seed

Seed demo data for project management:

```bash
node backend/scripts/seed-project-management-v2-demo.js
```

Default behavior: ensure a demo template exists only (no demand update).

To also bind a demand to project mode and inject demo members:

```bash
node backend/scripts/seed-project-management-v2-demo.js --bind
```

Bind specific demand ID:

```bash
node backend/scripts/seed-project-management-v2-demo.js --bind --demand REQ068
```

## API Regression

Run HTTP-level regression for project management APIs:

```bash
node backend/scripts/api-regression-project-management-v2.js --base-url http://127.0.0.1:3000/api
```

Auth mode priority:

1. `--token` / `API_REGRESSION_TOKEN`
2. `--username` + `--password` / env
3. fallback: signed token generated from an existing DB user

Common usage:

```bash
node backend/scripts/api-regression-project-management-v2.js --base-url http://127.0.0.1:3000/api
node backend/scripts/api-regression-project-management-v2.js --base-url http://127.0.0.1:3000/api --username admin --password '***'
```
