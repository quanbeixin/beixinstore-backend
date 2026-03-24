# Staging 使用规范

## 文档目标

本文档用于说明本项目在 `staging` 环境下的统一使用规则，包括环境启动、数据库迁移、基础结构准备和联调边界，不记录单次搭建流水。

## 一、适用范围

本文档适用于以下场景：

- 本机按 `staging` 配置启动后端
- 测试环境数据库迁移
- 新建或重建测试库
- 发布前联调与回归

## 二、当前项目约定

- 环境文件：`.env.staging`
- 默认端口：`3001`
- 默认测试库：`beixin_store_staging`
- migration 目录：`sql/migrations/`
- 默认关闭启动自动建表

## 三、环境启动规则

### 1. 启动命令

本机或测试机运行 `staging` 时，统一使用：

```powershell
npm run start:staging
```

### 2. 健康检查

服务启动后，应优先检查：

```text
GET /health
```

### 3. 环境配置规则

`.env.staging` 应满足以下要求：

- 使用独立测试库
- 使用独立测试账号
- `JWT_SECRET` 不与正式环境复用
- `ENABLE_LEGACY_BOOTSTRAP=false`

## 四、数据库迁移规则

### 1. 执行顺序

数据库变更统一先做 dry-run，再正式执行：

```powershell
npm run migrate:staging:dry-run
npm run migrate:staging
```

### 2. migration 原则

- 所有结构变更统一进入 `sql/migrations/`
- migration 文件采用时间加顺序编号
- 已进入协作流程的 migration 不随意改写历史版本

### 3. 结构来源原则

测试库结构应与正式库兼容，但不通过“直接连正式库”解决问题。

## 五、基础结构规则

如果测试库是空库，需先确保基础表存在，再执行业务 migration。

建议保底存在的基础表包括：

- `departments`
- `users`
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`

如项目依赖继续扩展，可将更多通用基础表纳入基线结构，但原则不变：

- 基础结构优先独立维护
- 业务 migration 建立在基础结构已存在的前提上

## 六、联调规则

联调时建议按以下顺序检查：

1. 环境变量是否指向 `staging`
2. `/health` 是否正常
3. 登录是否正常
4. 权限是否正常
5. 核心接口是否正常
6. 前后端联调结果是否一致

## 七、数据边界规则

- `staging` 可以保留演示数据和联调数据
- `staging` 不得承载正式业务写入
- 正式环境禁止直接写入未验证的测试数据
- 如需使用接近真实的数据，必须先脱敏

## 八、团队协作规则

- 默认先在 `staging` 验证，再进入正式环境
- 不在 `staging` 手工改结构后遗漏 migration
- 不用“服务器上临时改代码”的方式代替正式发布
- 发现环境问题时，优先补规则文档，不补过程流水文档

## 九、关联文档

- 环境分层规范：[environment-staging-production.md](/d:/Project/beixinstore-backend/docs/environment-staging-production.md)
- 发布流程：[release-sop.md](/d:/Project/beixinstore-backend/docs/release-sop.md)
- 发布检查单：[release-checklist.md](/d:/Project/beixinstore-backend/docs/release-checklist.md)
