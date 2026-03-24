# 环境分层规范

## 文档目标

本文档用于说明本项目在 `staging` 与 `production` 两类环境中的职责边界、环境一致性要求和部署原则，只记录长期有效的环境规则。

## 一、环境分层原则

本项目至少维护两套环境：

- `staging`：联调、回归、预发布验证环境
- `production`：正式对外服务环境

核心原则如下：

1. 测试环境不能直连正式数据库
2. 正式环境不能承载测试数据和临时调试操作
3. 所有准备上线的改动，必须先在 `staging` 验证
4. 验证通过后，再将同一版本晋升到 `production`

## 二、环境一致性要求

`staging` 与 `production` 应尽量保持同构，至少保证以下内容一致：

- 操作系统大版本
- Node.js 大版本
- `package-lock.json`
- 中间件类型
- 启动方式
- 环境变量键名

允许不同的内容包括：

- 域名
- 机器规格
- 数据库地址
- 第三方服务账号
- 数据量

## 三、当前项目环境约定

当前项目已支持按 `APP_ENV` 加载不同环境文件：

- `APP_ENV=staging`：优先加载 `.env.staging`
- `APP_ENV=production`：优先加载 `.env.production`
- 其他情况：默认加载 `.env`

数据库变更统一通过 `sql/migrations/` 管理，默认不依赖服务启动时自动建表。

仅在历史兼容或应急场景下，才允许临时启用：

```env
ENABLE_LEGACY_BOOTSTRAP=true
```

常规情况下应保持：

```env
ENABLE_LEGACY_BOOTSTRAP=false
```

## 四、数据库边界

### 1. 环境隔离

- `staging` 使用独立测试库
- `production` 使用正式库
- 两边结构应保持一致

### 2. 结构管理

- 表结构变更统一走 migration
- 不依赖“测试库手工改一次，正式库再手工改一次”
- 不依赖应用启动自动补表

### 3. 数据安全

- 测试环境如使用接近真实的数据，必须先脱敏
- 用户隐私数据、密钥、令牌不得直接从正式环境原样复制到测试环境

## 五、部署原则

### 1. 版本原则

上线的必须是一个明确的版本，而不是服务器上临时改过的代码。

建议至少满足以下任一条件：

- 同一个 git commit
- 同一份部署制品
- 同一次锁版本依赖安装结果

### 2. 晋升原则

标准顺序如下：

1. 本地开发
2. 部署并验证 `staging`
3. 确认数据库 migration 可执行
4. 确认关键业务回归通过
5. 发布同一版本到 `production`

## 六、配置安全原则

### 1. 敏感信息管理

- 仓库中不应长期保存真实数据库密码
- 仓库中不应长期保存真实 JWT 密钥
- 生产敏感配置优先通过服务器环境变量或未入库的 `.env.*` 文件注入

### 2. 键名规范

`.env.staging` 与 `.env.production` 应保持键名一致，只允许值不同，不允许通过不同键名制造环境分支逻辑。

## 七、推荐配套文档

- Staging 使用规则：[staging-rules.md](/d:/Project/beixinstore-backend/docs/staging-rules.md)
- 发布流程：[release-sop.md](/d:/Project/beixinstore-backend/docs/release-sop.md)
- 发布检查单：[release-checklist.md](/d:/Project/beixinstore-backend/docs/release-checklist.md)
- Git 流转规则：[git-release-flow.md](/d:/Project/beixinstore-backend/docs/git-release-flow.md)
