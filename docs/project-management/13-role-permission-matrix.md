# 角色权限规则（项目管理模块）

## 一、文档范围

本文档仅定义角色权限规则，不记录排查步骤、实现过程、阶段流水。

适用范围：

- 后端 RBAC 鉴权规则
- 前端菜单与路由可见规则
- 项目管理模块（业务线、需求池、缺陷、流程、统计）

基线环境：

- `staging`（`beixin_store_staging`）

## 二、角色定义

- `SUPER_ADMIN`：超级管理员
- `BUSINESS_LINE_ADMIN`：业务线管理员
- `ADMIN`：管理员
- `USER`：普通成员

## 三、鉴权总规则

### 1. 超级管理员规则

- `SUPER_ADMIN` 为全量放行角色。
- 超级管理员不依赖 `role_permissions` 显式权限码也可访问全部功能。

### 2. 非超级管理员规则

- `ADMIN / BUSINESS_LINE_ADMIN / USER` 必须命中已分配权限码才可访问。
- 未分配权限码即不可见、不可调用、不可操作。

### 3. 菜单可见叠加规则

菜单可见性同时受两类规则控制：

- 权限码/角色规则（`requiredPermission`、`requiredRoles`）
- 菜单可见规则（`menu_visibility_rules`）

最终可见结果必须同时满足两者。

## 四、项目管理权限码清单

- `project.view`
- `project.create`
- `project.edit`
- `project.delete`
- `project.member.manage`
- `project.stats.view`
- `requirement.view`
- `requirement.create`
- `requirement.edit`
- `requirement.transition`
- `bug.view`
- `bug.create`
- `bug.edit`
- `bug.transition`
- `business_line.switch`
- `demand.view`
- `demand.manage`
- `demand.transfer_owner`
- `demand.workflow.view`
- `demand.workflow.manage`
- `demand.workflow.template.view`
- `demand.workflow.template.edit`
- `demand.workflow.template.publish`
- `demand.workflow.instance.transition`

## 五、角色权限矩阵（当前规则）

### SUPER_ADMIN

- 规则：全量权限（直通）。

### ADMIN

- 规则：拥有项目管理主干权限。
- 包含：`project.*`、`bug.*`、`demand.*`、`demand.workflow.*`、`demand.workflow.template.*`、`business_line.switch`。
- 可兼容保留：`requirement.*`（历史口径）。

### BUSINESS_LINE_ADMIN

- 规则：默认具备业务线内项目/缺陷/统计能力。
- 当前不默认包含：`demand.*` 与 `demand.workflow.*`、`demand.workflow.template.*`、`business_line.switch`。
- 若需开放需求池与流程配置，必须显式补齐对应权限码。

### USER

- 规则：不默认分配项目管理权限码。

## 六、变更规则

- 角色权限变更必须通过“角色权限配置”或 migration 执行。
- 新增权限码时必须评估 `ADMIN` 与 `BUSINESS_LINE_ADMIN` 是否需要默认继承。
- 权限策略变更后，只更新本规则文档，不新增过程记录文档。
