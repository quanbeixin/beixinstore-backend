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

建议再执行 verify：

```bash
cd /Users/baopengfei/JS/beixinstore-backend

for f in $(ls docs/migrations/*-verify.sql | sort); do
  echo "==> verify: $f"
  node docs/migrations/run-sql-with-mysql2.js "$f" || exit 1
done
```

## 2. 必跑 Seed 清单

为确保数据与当前环境一致，至少执行：

1. `/Users/baopengfei/.local/mysql/beixin_store_local_bootstrap.sql`
2. `/Users/baopengfei/.local/mysql/beixin_store_local_seed_pm.sql`

执行示例（按当前本机账号）：

```bash
/Users/baopengfei/.local/mysql/mysql-8.0.45/bin/mysql \
  --protocol=TCP -h 127.0.0.1 -P 3306 -u beixin_local -p'beixin_local_123' \
  beixin_store_local < /Users/baopengfei/.local/mysql/beixin_store_local_bootstrap.sql

/Users/baopengfei/.local/mysql/mysql-8.0.45/bin/mysql \
  --protocol=TCP -h 127.0.0.1 -P 3306 -u beixin_local -p'beixin_local_123' \
  beixin_store_local < /Users/baopengfei/.local/mysql/beixin_store_local_seed_pm.sql
```

## 3. 一条命令导出数据库快照（当前机器）

```bash
/Users/baopengfei/.local/mysql/mysql-8.0.45/bin/mysqldump \
  --protocol=TCP -h 127.0.0.1 -P 3306 -u beixin_local -p'beixin_local_123' \
  --single-transaction --routines --triggers --default-character-set=utf8mb4 \
  beixin_store_local > /Users/baopengfei/JS/beixinstore-backend/docs/db-snapshot-$(date +%F-%H%M%S).sql
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

