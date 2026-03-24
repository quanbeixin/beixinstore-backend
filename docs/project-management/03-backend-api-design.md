# 项目管理模块后端 API 设计

## API 设计原则

- 保持现有 `/api/*` 路由风格
- 复用现有 JWT 认证与 RBAC 权限体系
- 按业务域拆分路由
- 列表查询统一走分页参数
- 状态流转、指派、工时更新等动作使用明确接口，不混入通用编辑接口

## 路由分组

- `/api/projects`
- `/api/requirements`
- `/api/bugs`
- `/api/project-stats`

## 响应约定

```json
{
  "success": true,
  "message": "可选提示信息",
  "data": {}
}
```

## 认证方式

所有项目管理接口均要求：

```http
Authorization: Bearer <token>
```

## 数据范围隔离

- 项目管理模块接口默认按业务线进行数据范围隔离。
- 超级管理员可查看全部业务线数据。
- 非超级管理员仅可访问其绑定业务线的数据。
- 非超级管理员未绑定业务线时，接口返回 `403`。
- 越权访问其他业务线数据时，接口返回 `403`。

## 1. 项目管理接口

### `GET /api/projects`

项目列表，支持分页与筛选。

可用查询参数：

- `page`
- `pageSize`
- `keyword`
- `status`
- `owner_user_id`

### `GET /api/projects/:id`

项目详情。

建议返回内容：

- 项目基础信息
- 项目负责人信息
- 项目成员列表
- 需求数量与 Bug 数量汇总

### `POST /api/projects`

创建项目。

请求体：

```json
{
  "name": "商城重构",
  "project_code": "SHOP-2026",
  "description": "后台与前台重构",
  "status": "IN_PROGRESS",
  "owner_user_id": 11,
  "start_date": "2026-03-23",
  "end_date": "2026-06-30"
}
```

### `PUT /api/projects/:id`

更新项目基础信息。

### `DELETE /api/projects/:id`

软删除项目。

MVP 建议：

- 设置 `is_deleted = 1`
- 不直接物理删除关联需求与 Bug

### `GET /api/projects/:id/members`

获取项目成员列表。

### `POST /api/projects/:id/members`

新增项目成员。

请求体：

```json
{
  "user_id": 9,
  "project_role": "QA"
}
```

### `PUT /api/projects/:id/members/:memberId`

更新项目成员角色。

### `DELETE /api/projects/:id/members/:memberId`

移除项目成员。

## 2. 需求管理接口

### `GET /api/requirements`

需求列表。

可用查询参数：

- `page`
- `pageSize`
- `keyword`
- `project_id`
- `status`
- `priority`
- `assignee_user_id`
- `stage`

### `GET /api/requirements/:id`

需求详情。

### `POST /api/requirements`

创建需求。

请求体：

```json
{
  "project_id": 1,
  "title": "支持多角色审批",
  "description": "新增基础审批流入口",
  "priority": "HIGH",
  "status": "TODO",
  "stage": "REQUIREMENT",
  "assignee_user_id": 10,
  "estimated_hours": 16,
  "actual_hours": 0,
  "start_date": "2026-03-24",
  "due_date": "2026-03-28"
}
```

### `PUT /api/requirements/:id`

更新需求基础信息。

### `DELETE /api/requirements/:id`

软删除需求。

### `PUT /api/requirements/:id/status`

需求状态流转。

请求体：

```json
{
  "status": "IN_PROGRESS"
}
```

MVP 建议允许的流转：

- `TODO` -> `IN_PROGRESS`
- `IN_PROGRESS` -> `DONE`
- `DONE` -> `IN_PROGRESS`

### `PUT /api/requirements/:id/stage`

更新需求阶段。

请求体：

```json
{
  "stage": "TEST"
}
```

### `PUT /api/requirements/:id/assignee`

指派负责人。

请求体：

```json
{
  "assignee_user_id": 11
}
```

### `PUT /api/requirements/:id/hours`

更新工时。

请求体：

```json
{
  "estimated_hours": 24,
  "actual_hours": 18
}
```

## 3. Bug 管理接口

### `GET /api/bugs`

Bug 列表。

可用查询参数：

- `page`
- `pageSize`
- `keyword`
- `project_id`
- `requirement_id`
- `status`
- `severity`
- `assignee_user_id`
- `stage`

### `GET /api/bugs/:id`

Bug 详情。

### `POST /api/bugs`

创建 Bug。

请求体：

```json
{
  "project_id": 1,
  "requirement_id": 2,
  "title": "提交按钮无响应",
  "description": "用户提交表单后没有提示",
  "reproduce_steps": "1. 打开表单 2. 填写内容 3. 点击提交",
  "severity": "HIGH",
  "status": "OPEN",
  "stage": "DEVELOPMENT",
  "assignee_user_id": 10,
  "estimated_hours": 4,
  "actual_hours": 0,
  "due_date": "2026-03-25"
}
```

### `PUT /api/bugs/:id`

更新 Bug 基础信息。

### `DELETE /api/bugs/:id`

软删除 Bug。

### `PUT /api/bugs/:id/status`

Bug 状态流转。

请求体：

```json
{
  "status": "FIXING"
}
```

MVP 建议允许的流转：

- `OPEN` -> `FIXING`
- `FIXING` -> `VERIFIED`
- `VERIFIED` -> `CLOSED`
- `VERIFIED` -> `FIXING`

### `PUT /api/bugs/:id/stage`

更新 Bug 所处阶段。

### `PUT /api/bugs/:id/assignee`

指派开发人员。

### `PUT /api/bugs/:id/hours`

更新工时。

## 4. 统计接口

### `GET /api/project-stats/overview`

总览统计。

建议返回：

- 项目总数
- 进行中项目数
- 已完成项目数
- 需求总数
- Bug 总数
- 预计总工时
- 实际总工时
- 总人天

### `GET /api/project-stats/projects`

按项目统计。

可用查询参数：

- `status`
- `owner_user_id`

建议返回字段：

- `project_id`
- `project_name`
- `requirement_count`
- `bug_count`
- `estimated_hours`
- `actual_hours`
- `person_days`

### `GET /api/project-stats/members`

按成员统计。

可用查询参数：

- `project_id`
- `user_id`

建议返回字段：

- `user_id`
- `username`
- `real_name`
- `requirement_count`
- `bug_count`
- `estimated_hours`
- `actual_hours`
- `person_days`

## 5. 操作日志接口

MVP 阶段可以作为项目详情下的子资源暴露。

### `GET /api/projects/:id/activity-logs`

可用查询参数：

- `page`
- `pageSize`
- `entity_type`

## 控制器建议

推荐新增以下控制器：

- `projectController.js`
- `requirementController.js`
- `bugController.js`
- `projectStatsController.js`

## 路由文件建议

- `routes/projectRoutes.js`
- `routes/requirementRoutes.js`
- `routes/bugRoutes.js`
- `routes/projectStatsRoutes.js`

## 参数校验建议

### 项目

- `name` 必填
- `status` 仅允许 `IN_PROGRESS`、`COMPLETED`

### 需求

- `project_id` 必填
- `title` 必填
- `priority` 仅允许 `LOW`、`MEDIUM`、`HIGH`、`URGENT`
- `status` 仅允许 `TODO`、`IN_PROGRESS`、`DONE`

### Bug

- `project_id` 必填
- `title` 必填
- `severity` 仅允许 `LOW`、`MEDIUM`、`HIGH`、`CRITICAL`
- `status` 仅允许 `OPEN`、`FIXING`、`VERIFIED`、`CLOSED`

## 日志建议

以下操作建议写入日志：

- 创建项目
- 编辑项目
- 删除项目
- 添加、删除、更新成员
- 创建、编辑、删除需求
- 创建、编辑、删除 Bug
- 指派负责人
- 状态流转
- 工时更新

## 权限建议

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
