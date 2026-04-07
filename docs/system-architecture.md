# Beixin Store 全系统架构整合文档

- 文档版本: v1.0
- 首次建立: 2026-04-02
- 适用范围:
  - 后端仓库: `/Users/baopengfei/JS/beixinstore-backend`
  - 前端仓库: `/Users/baopengfei/JS/beixinstore-frontend`
- 维护责任: 后端/前端提交功能变更的开发者

## 0. 目标与原则

本文档用于统一描述系统级架构，覆盖:
1. 架构总览
2. 权限系统详细设计
3. Workflow 流程引擎详细设计
4. 数据库领域模型（ER 视角）

原则:
- 代码与数据库结构是最终事实来源，文档必须跟随变更更新。
- 任何影响 API、权限、流程、数据模型的变更，必须同步更新本文档。

---

## A. 架构总览（系统级）

### A.1 系统边界与部署形态

当前系统由两个并列仓库构成:
- 后端服务: `beixinstore-backend`
- 前端管理台: `beixinstore-frontend`

架构形态:
- 后端是单体服务（Monolith），通过 PM2 支持 cluster 多进程运行。
- 前端是 React SPA，通过 Vite 构建与开发。
- 数据存储为 MySQL。
- 未发现独立消息队列/任务队列服务（如 BullMQ、RabbitMQ、Kafka）。

### A.2 技术栈矩阵

#### 后端
- 语言: JavaScript (Node.js)
- Web 框架: Express 4
- DB 驱动: mysql2/promise
- 认证: JWT
- 安全中间件: helmet, cors, cookie-parser, express-rate-limit, csurf
- 进程管理: PM2（cluster）

#### 前端
- 框架: React 19
- 路由: react-router-dom 7
- UI: Ant Design 6
- 图表: ECharts + echarts-for-react
- 请求库: Axios
- 构建工具: Vite 8

### A.3 仓库结构

#### 后端仓库关键目录
- `server.js`: 入口，挂载中间件和各业务路由
- `routes/`: 路由定义层
- `controllers/`: 控制器层（参数解析、调用模型、返回响应）
- `models/`: 数据访问与核心业务编排（大量 SQL 在此）
- `middleware/`: 认证、鉴权、安全策略
- `utils/`: DB、JWT、流程图辅助工具
- `docs/migrations/`: SQL 迁移与执行脚本
- `scripts/`: 冒烟/回归脚本

#### 前端仓库关键目录
- `src/App.jsx`: 路由装配与权限入口
- `src/config/route.config.js`: 路由与菜单元数据
- `src/api/`: 后端接口封装
- `src/pages/`: 页面容器
- `src/modules/`: 业务模块（workflow、project-template、bug 等）
- `src/utils/access.js`: 权限判断、登录态和菜单可见性策略

### A.4 核心业务域划分

后端按域划分为:
- auth: 登录、注册、个人资料
- users/org/rbac: 用户、组织、角色权限、菜单可见规则
- work: 需求、日志、工作台、流程、洞察、模板、归档
- bug: 缺陷管理（挂在 work 路由域）
- config/options: 字典与系统配置

前端按页面与模块划分为:
- 系统管理: 用户、部门、角色、权限、菜单、字典
- 项目管理: 需求池、模板、流程、通知配置、归档
- 工作台: 个人工作台、Owner 工作台、晨会看板
- 洞察分析: 部门/成员/需求效率看板
- Bug 管理

### A.5 API 组织方式

统一前缀 `/api`，主要域:
- `/api/auth`
- `/api/users`
- `/api/org`
- `/api/rbac`
- `/api/work`

接口风格:
- REST 为主
- 对流程动作采用动作子路径，如:
  - `/demands/:id/workflow/current/submit`
  - `/demands/:id/workflow/current/reject`
  - `/demands/:id/workflow/current/force-complete`

---

## B. 权限系统详细设计

### B.1 权限模型

权限模型为 RBAC:
- 用户与角色: `user_roles`
- 角色与权限: `role_permissions`
- 权限定义: `permissions`
- 角色定义: `roles`

访问上下文（后端计算后挂载到请求）包含:
- `role_keys`
- `permission_codes`
- `is_super_admin`
- `is_department_manager`
- `managed_department_ids`
- `permission_ready`

### B.2 后端鉴权链路

请求鉴权流程:
1. `authMiddleware` 解析并校验 JWT
2. 载入用户访问上下文 `Permission.getUserAccess`
3. 路由级 guard:
   - `requirePermission(codes)`（all）
   - `requireAnyPermission(codes)`（any）
4. 通过后进入 controller

关键行为:
- `is_super_admin` 拥有全权限短路。
- 当 `permission_ready=false` 且 `RBAC_STRICT=false` 时可宽松放行（兼容旧库）。

### B.3 前端权限链路

前端权限控制位于:
- `src/config/route.config.js`: `requiredPermission` / `requiredRoles`
- `src/utils/access.js`: `canAccessRoute/hasPermission/hasRole`
- `src/api/http.js`: 401 自动清理并跳转登录

前端与后端协同:
- 前端做“可见性与导航”控制。
- 后端做“最终授权”控制（强约束）。

### B.4 菜单可见性机制

系统支持“菜单可见性规则”:
- 规则来源: `menu_visibility_rules`（后端）
- 用户可见映射: `/api/rbac/menu-visibility/me`
- 前端本地缓存 `menu_access_map` 并用于菜单渲染

作用:
- 在 RBAC 之外增加菜单级可见范围控制（角色/部门等）。

### B.5 权限演进与兼容

兼容策略体现为:
- 权限别名映射（前后端都存在 alias 扩展）
- 老字段/老表回退查询
- `permission_ready` 兼容开关

风险提示:
- 别名映射过多时，权限语义可能分散，建议定期归一化权限码。

---

## C. Workflow 流程引擎详细设计

### C.1 设计目标

流程引擎用于“需求生命周期可视化与可操作化”，核心能力:
- 流程模板定义
- 需求实例化
- 节点状态流转
- 任务自动生成与跟踪
- 与工作日志联动（工时、状态）

### C.2 核心实体

流程相关核心表:
- `wf_process_templates`: 流程模板主表
- `wf_process_template_nodes`: 模板节点
- `wf_process_instances`: 需求流程实例
- `wf_process_instance_nodes`: 实例节点
- `wf_process_tasks`: 节点任务
- `wf_process_actions`: 流程动作日志
- `node_status_logs`: 节点状态日志（配套）

业务关联表:
- `work_demands`: 需求主表
- `work_logs`: 工作日志（支持 `task_source='WORKFLOW_AUTO'`）

### C.3 状态机（概念）

实例状态:
- `NOT_STARTED` -> `IN_PROGRESS` -> `DONE`/`TERMINATED`

节点状态:
- `TODO` -> `IN_PROGRESS` -> `DONE`
- 允许 `RETURNED`（驳回）与 `CANCELLED`

任务状态:
- `TODO` / `IN_PROGRESS` / `DONE` / `CANCELLED`

### C.4 关键流程

#### 初始化流程
1. 读取需求对应模板（优先项目模板）
2. 无可用模板时确保默认模板
3. 创建流程实例 `wf_process_instances`
4. 创建实例节点 `wf_process_instance_nodes`
5. 激活入口节点与后续可达节点

#### 提交/驳回/强制完成
- 提交: 当前节点完成，推进后继节点，刷新实例状态
- 驳回: 回退到前序可执行节点，关闭/取消相关任务
- 强制完成: 在权限下跳过常规约束，直接完成节点

#### 节点任务与日志联动
- 节点被激活后，按 assignee 生成 `wf_process_tasks`
- 同步/生成 `work_logs`（`WORKFLOW_AUTO`）用于执行追踪
- 任务工时或截止时间变化可反向同步日志字段

### C.5 与需求、看板的关系

- `Owner 工作台`、`个人工作台`会消费流程待办、节点状态与工作日志。
- 需求详情页可展示流程图、节点状态、任务协作人。
- 流程动作（assign/submit/reject）直接影响工作台统计口径。

### C.6 流程引擎治理建议

- 流程表结构属于高耦合核心资产，迁移必须先于功能发布。
- 所有新增状态码要同步:
  1. 后端枚举
  2. 前端映射
  3. 文档状态图

---

## D. 数据库领域模型（ER 视角）

### D.1 领域分组

#### 用户与权限域
- `users`
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`
- `user_preferences`
- `user_change_logs`

关系:
- users N:M roles
- roles N:M permissions

#### 组织域
- `departments`
- `user_departments`

关系:
- users N:1 departments（主部门）
- users N:M departments（扩展分配）

#### 需求与项目域
- `work_demands`
- `project_templates`
- `project_members`
- `task_collaborators`
- `notification_config` 及相关通知表

关系:
- demand 关联 template
- demand 关联 owner/project_manager/member

#### 工作日志域
- `work_logs`
- `work_log_daily_plans`
- `work_log_daily_entries`
- `work_item_types`

关系:
- user 1:N work_logs
- demand 1:N work_logs
- work_logs 1:N daily_plans / daily_entries

#### 流程域
- `wf_process_templates`
- `wf_process_template_nodes`
- `wf_process_instances`
- `wf_process_instance_nodes`
- `wf_process_tasks`
- `wf_process_actions`

关系:
- template 1:N template_nodes
- demand 1:N instances（通常活跃 1 条）
- instance 1:N instance_nodes
- instance_node 1:N tasks
- instance 1:N actions

#### Bug 域
- `bugs`
- `bug_status_logs`
- `bug_attachments`

### D.2 关键一致性约束（实践层）

- 需求状态与流程实例状态需保持一致（完成时写回 `work_demands.status`）。
- 流程任务与工作日志（自动任务）需保持可追踪关系（`relate_task_id`）。
- 用户权限变更影响可见菜单和可操作接口，必须前后端同步。

### D.3 数据迁移治理

- 使用 `docs/migrations` 下 SQL + apply 脚本管理结构演进。
- 建议发布前执行:
  1. 结构迁移
  2. verify 脚本
  3. 冒烟脚本

---

## E. 风险与技术债观察

1. 文档与代码存在局部滞后（`docs/api.md` 未完整覆盖当前 `work` 大量路由）。
2. 后端 `models/Work.js`、`models/Workflow.js` 体量大，业务与 SQL 高耦合，维护成本高。
3. 兼容性分支较多（缺字段/缺表 fallback），说明历史版本差异较大。

建议:
- 逐步沉淀 service 层，缩小 model 复杂度。
- 建立“接口文档自动校验”或最小 OpenAPI 基线。
- 每次 schema 变更必须附带 verify + 文档更新。

---

## F. 文档维护规则（必须执行）

本节即“有变动时更新此文档”的执行规范。

### F.1 必须更新本文档的变更类型

发生以下任一变更时，必须更新 `docs/system-architecture.md`:
1. 新增/删除后端业务模块或路由域
2. 权限码、角色、菜单可见规则策略变更
3. Workflow 状态、节点、动作语义变更
4. 数据库核心表新增/删除/关键字段调整
5. 前端路由结构、权限守卫策略变更
6. 基础设施变更（新增队列、缓存、独立服务）

### F.2 提交要求

- 功能 PR 中必须包含本文档更新（若命中 F.1）。
- PR 描述需包含 “Architecture Doc Updated: Yes/No + 理由”。

### F.3 更新检查清单

每次更新本文档请至少检查:
1. 技术栈是否变化
2. API 域与关键路径是否变化
3. RBAC 链路是否变化
4. Workflow 表/状态机是否变化
5. ER 分组与关系是否变化

---

## G. 变更记录

- 2026-04-02: 初版整合文档建立，覆盖后端+前端、权限系统、workflow、ER 视角。
