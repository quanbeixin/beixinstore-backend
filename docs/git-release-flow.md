# Git 流转规则

## 文档目标

本文档用于说明开发、测试、正式三段之间的版本流转规则，保证测试通过的版本就是最终上线的版本。

## 一、核心原则

1. 上线的永远是一个明确的 commit
2. `staging` 与 `production` 不发布不同 commit
3. 不允许在服务器上直接改代码后不回仓库
4. 数据库改动必须配套 migration

## 二、推荐分支模型

推荐维护以下分支：

- `main`：正式分支
- `develop`：日常集成分支
- `feature/*`：功能开发分支
- `hotfix/*`：线上修复分支

如果团队规模较小，也可以简化为：

- `main`
- `feature/*`

但即使简化，版本边界原则不变。

## 三、日常开发流转

推荐顺序如下：

1. 从 `develop` 或 `main` 切出 `feature/*`
2. 在功能分支完成开发与自测
3. 合并到集成分支
4. 选择明确 commit 部署到 `staging`
5. `staging` 验证通过后，再将同一 commit 发布到 `production`

## 四、Hotfix 流转

紧急修复时建议：

1. 从 `main` 切出 `hotfix/*`
2. 完成修复并自测
3. 先在 `staging` 快速验证
4. 验证通过后发布到 `production`
5. 如团队维护 `develop`，记得同步回灌

## 五、版本标识建议

推荐统一保留以下可追踪信息：

- 功能分支名称
- 对应 commit id
- 发布标签

可参考命名：

- `feature/project-management-list`
- `hotfix/login-token-expiry`
- `v2026.03.23-01`
