# 项目管理模块架构设计

## 目标

- 在现有后台系统中扩展项目管理能力，不破坏已有模块
- 保持实现简洁、可维护、可扩展
- 先完成 MVP 版本，再逐步迭代增强

## 整体设计原则

- 复用现有登录、用户、角色、权限体系
- 复用当前后端分层结构：`routes`、`controllers`、`models`、`utils`
- 复用当前前端结构：React + Ant Design + 路由与菜单配置
- 以“新增表”为主，不重写现有核心表
- 将项目管理作为独立业务域接入，避免和现有 `work` 模块强耦合

## 模块边界

项目管理模块建议拆分为以下几个子域：

1. `projects`
- 管理项目基础信息
- 管理项目成员
- 管理项目状态

2. `requirements`
- 管理需求生命周期
- 关联所属项目
- 指派负责人
- 管理优先级、状态和工时

3. `bugs`
- 管理 Bug 提交与修复流程
- 关联所属项目
- 可选关联具体需求
- 管理严重程度和处理人

4. `workflow`
- 用轻量级阶段字段表示开发流程
- MVP 阶段不引入复杂工作流引擎

5. `stats`
- 按项目统计工时
- 按成员统计工时
- 提供人天换算和简单统计数据

6. `activity logs`
- 记录谁在什么时候做了什么操作

## 后端架构

建议新增如下文件：

### 路由层

- `routes/projectRoutes.js`
- `routes/requirementRoutes.js`
- `routes/bugRoutes.js`
- `routes/projectStatsRoutes.js`

建议路由前缀：

- `/api/projects`
- `/api/requirements`
- `/api/bugs`
- `/api/project-stats`

### 控制器层

- `controllers/projectController.js`
- `controllers/requirementController.js`
- `controllers/bugController.js`
- `controllers/projectStatsController.js`

职责建议：

- `projectController`：项目 CRUD、成员管理、项目详情聚合
- `requirementController`：需求 CRUD、状态流转、负责人指派、工时更新
- `bugController`：Bug CRUD、状态流转、开发指派、工时更新
- `projectStatsController`：项目维度和成员维度统计

### 模型层

- `models/Project.js`
- `models/ProjectMember.js`
- `models/Requirement.js`
- `models/Bug.js`
- `models/ProjectActivityLog.js`
- `models/ProjectStats.js`

## 前端架构

建议新增如下前端文件：

### API 层

- `src/api/projects.js`
- `src/api/requirements.js`
- `src/api/bugs.js`
- `src/api/projectStats.js`

### 页面层

- `src/pages/Projects.jsx`
- `src/pages/ProjectDetail.jsx`
- `src/pages/Requirements.jsx`
- `src/pages/Bugs.jsx`
- `src/pages/ProjectStats.jsx`

可选的轻量看板页：

- `src/pages/ProjectBoard.jsx`

### 组件层

- `src/components/project/ProjectFormModal.jsx`
- `src/components/project/ProjectMemberModal.jsx`
- `src/components/project/ProjectStatusTag.jsx`
- `src/components/requirement/RequirementFormModal.jsx`
- `src/components/requirement/RequirementStatusTag.jsx`
- `src/components/bug/BugFormModal.jsx`
- `src/components/bug/BugSeverityTag.jsx`
- `src/components/stats/HoursSummaryCards.jsx`
- `src/components/stats/ProjectHoursChart.jsx`

## 权限接入

继续复用现有 RBAC 权限体系，建议新增如下权限码：

- `project.view`
- `project.create`
- `project.edit`
- `project.delete`
- `project.member.manage`
- `requirement.view`
- `requirement.create`
- `requirement.edit`
- `requirement.transition`
- `bug.view`
- `bug.create`
- `bug.edit`
- `bug.transition`
- `project.stats.view`

权限建议：

- `SUPER_ADMIN`：拥有全部权限
- `ADMIN`：拥有项目管理模块完整权限
- 普通成员：限制为参与项目或本人负责的数据

## 数据流设计

### 项目流

- 创建项目
- 添加项目成员
- 定义项目内角色
- 项目状态从 `IN_PROGRESS` 流转到 `COMPLETED`

### 需求流

- 需求归属于某个项目
- 需求可指派给负责人
- 状态流转：`TODO` -> `IN_PROGRESS` -> `DONE`

### Bug 流

- Bug 归属于某个项目
- Bug 可关联某个需求
- 状态流转：`OPEN` -> `FIXING` -> `VERIFIED` -> `CLOSED`

### 统计流

统计数据主要从需求和 Bug 的 `estimated_hours` 与 `actual_hours` 字段汇总得出。

## 兼容策略

- 不修改现有登录流程
- 通过 `user_id` 关联现有用户
- 不将项目管理模块并入现有 `work` 模块
- 将项目管理保持为独立业务域
- 只新增权限，不覆盖现有权限

## MVP 范围

第一期包含：

- 项目 CRUD
- 项目成员管理
- 需求 CRUD 与状态流转
- Bug CRUD 与状态流转
- 工时字段与汇总
- 简单统计页面
- 操作日志

第一期不包含：

- 评论系统
- 文件上传
- 甘特图
- 复杂审批流
- 通知中心
- Sprint 规划
- 拖拽式看板
