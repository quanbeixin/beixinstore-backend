# 数据库迁移交接清单（另一台机器复现）

本文用于在另一台机器快速复现当前本地数据库状态，适配当前项目：

- 后端仓库：`/Users/baopengfei/JS/beixinstore-backend`
- 数据库：MySQL
- 当前库名：`beixin_store_local`

## 1. 迁移执行顺序（Migration）

推荐使用“按日期升序执行所有 `*-up.sql`”方式，避免漏跑：

```bash
cd /Users/baopengfei/JS/beixinstore-backend

for f in $(ls docs/migrations/*-up.sql | sort); do
  echo "==> applying: $f"
  node docs/migrations/run-sql-with-mysql2.js "$f" || exit 1
done
```

已知依赖顺序（如果单独执行脚本，需注意）：

1. `2026-03-29-bug-management-up.sql` 必须先于 `2026-03-29-bug-issue-stage-up.sql`
2. `2026-03-30-work-demand-links-up.sql` 必须先于 `2026-03-30-demand-hour-summary-up.sql`

说明：按文件名升序批量执行通常不会遇到人工顺序错误；若拆分执行，请按以上顺序处理。

建议再执行 verify：

```bash
cd /Users/baopengfei/JS/beixinstore-backend

for f in $(ls docs/migrations/*-verify.sql | sort); do
  echo "==> verify: $f"
  node docs/migrations/run-sql-with-mysql2.js "$f" || exit 1
done
```

## 2. 必跑 Seed 清单

为确保数据与当前环境一致，至少执行两份 seed：

1. `<SEED_DIR>/beixin_store_local_bootstrap.sql`
2. `<SEED_DIR>/beixin_store_local_seed_pm.sql`

执行示例（请替换参数与路径）：

```bash
mysql \
  --protocol=TCP -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p'<DB_PASSWORD>' \
  <DB_NAME> < <SEED_DIR>/beixin_store_local_bootstrap.sql

mysql \
  --protocol=TCP -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p'<DB_PASSWORD>' \
  <DB_NAME> < <SEED_DIR>/beixin_store_local_seed_pm.sql
```

## 3. 一条命令导出数据库快照（当前机器）

```bash
mysqldump \
  --protocol=TCP -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p'<DB_PASSWORD>' \
  --single-transaction --routines --triggers --default-character-set=utf8mb4 \
  <DB_NAME> > ./docs/db-snapshot-$(date +%F-%H%M%S).sql
```

## 4. 另一台机器导入命令

先创建空库：

```bash
mysql -h <HOST> -P <PORT> -u <USER> -p \
  -e "CREATE DATABASE IF NOT EXISTS beixin_store_local DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
```

导入快照：

```bash
mysql -h <HOST> -P <PORT> -u <USER> -p beixin_store_local < /path/to/db-snapshot-YYYY-MM-DD-HHMMSS.sql
```

## 5. 推荐落地策略

1. 优先使用“快照导入”（速度最快、环境一致性最高）。
2. 如需标准化复建，再执行 migration + seed。
3. 导入后执行烟雾检查：

```bash
cd /Users/baopengfei/JS/beixinstore-backend
node scripts/smoke-project-management-v2.js
```

## 6. 运行前置

1. 拉取前后端 `notification` 分支。
2. 后端复制 `.env.example` 为 `.env`，配置 DB/JWT/飞书参数。
3. 确认数据库网络可达、账号有建表与写入权限。
