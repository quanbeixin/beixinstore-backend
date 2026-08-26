# 独立业务线无业务数据部署交付包设计

## 目标

生成一份可直接交给另一条业务线的独立部署交付包。接收方能够在空 MySQL 数据库中完成结构初始化、导入必要系统配置、按需导入现有流程模板，并自行创建首个管理员。交付包不得包含当前业务线的业务记录、用户身份数据或任何密钥。

## 交付结构

交付包目录为 `deployment-handoff/`：

```text
deployment-handoff/
  database/
    01-schema.sql
    02-system-seed.sql
    03-optional-templates.sql
    verify.sql
  scripts/
    install-database.sh
    create-admin.js
  config/
    backend.env.example
    frontend.env.example
  README.md
  MANIFEST.md
  checksums.sha256
```

`01-schema.sql` 是当前数据库结构快照，包含全部基础表、索引、外键及数据库对象，不包含表数据。它是首次部署的基线；仓库中的后续 migration 仍作为版本升级依据。

`02-system-seed.sql` 仅包含系统启动和通用功能所需的白名单配置。`03-optional-templates.sql` 单独包含可选的当前项目模板和流程模板，接收方可根据是否复用当前流程决定是否导入。

## 数据边界

核心初始化数据白名单：

- `config_dict_types`
- `config_dict_items`
- `roles`
- `permissions`
- `role_permissions`
- `work_item_types`
- `bug_workflow_transitions`
- `efficiency_factor_settings`
- `notification_config`

可选模板数据白名单：

- `project_templates`
- `wf_process_templates`
- `wf_process_template_nodes`

模板导出前需清除创建人等用户引用；项目模板中的群聊配置不得携带当前业务线群聊 ID。

以下类型全部排除：

- 用户、部门、角色绑定和个人偏好
- 需求、项目、任务、Bug、反馈、矩阵包及开发者账号
- 文件附件、评论、审批记录、通知记录和操作日志
- 飞书用户绑定、用户快照、群聊 ID 和消息接收人
- AI Prompt、模型配置和执行日志
- API Token、会话信息、OSS 凭证、数据库密码、JWT 密钥及其他环境密钥
- `menu_visibility_rules` 中绑定当前部门 ID 的配置

不在白名单中的表只保留结构，不导出数据。

## 管理员初始化

交付包不内置固定管理员账号或密码。`scripts/create-admin.js` 从命令行参数或专用环境变量读取用户名、姓名和密码，使用项目现有密码散列方式创建用户，并赋予内置管理员角色。脚本必须拒绝空密码和明显弱密码，且不得在日志中打印明文密码。

## 配置交付

`backend.env.example` 和 `frontend.env.example` 只列出运行所需变量、用途和安全占位值。当前环境的 `.env`、真实域名、Token、Cookie、私钥和第三方凭证不得复制进入交付包。

README 说明以下流程：

1. 创建 utf8mb4 空数据库和最小权限数据库账号。
2. 填写后端环境变量。
3. 执行 `scripts/install-database.sh` 导入结构和核心 seed。
4. 按需导入模板 seed。
5. 执行 `scripts/create-admin.js` 创建首个管理员。
6. 启动后端和前端。
7. 执行 `database/verify.sql` 和健康检查。

## 安装与幂等

安装脚本必须使用 `set -euo pipefail`，检查 MySQL 客户端和必要环境变量，并在任一步失败时停止。结构脚本面向空数据库；seed 使用稳定业务键和幂等写法，避免重复执行产生重复数据。

模板 seed 默认为不执行，由安装参数显式开启。安装脚本不得删除已有数据库或覆盖未确认的数据。

## 交付检查

- 本次交付不创建临时数据库，也不执行导入、启动或登录验收。
- 静态检查结构 SQL 覆盖当前全部表，并检查核心 seed 和可选模板 seed 的目标表白名单。
- 静态检查可选模板 seed 不包含用户、部门或群聊引用。
- 对管理员脚本执行语法和代码检查，不实际创建账号。
- `verify.sql` 提供给接收方在目标数据库导入后检查表数量、必需字典、角色、权限和模板数量。
- 交付目录扫描不到当前环境的数据库地址、密码、Token、Cookie、AccessKey、用户邮箱、手机号或飞书 ID。
- `checksums.sha256` 覆盖所有交付文件，接收方可验证文件完整性。

## 版本与维护

`MANIFEST.md` 记录生成日期、源代码前后端提交、数据库版本、表数量、核心 seed 表及可选 seed 表。每次正式交付应重新生成结构与 seed、完成静态检查并更新校验和；接收方应在其目标环境执行导入验证，避免手工维护 SQL 快照导致漂移。
