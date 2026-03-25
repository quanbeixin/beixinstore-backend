# 需求池替换与 Bug 关联规则

## 一、目标

- 项目管理中的“需求管理”入口统一切换为“需求池”，避免重复维护两套需求数据。
- Bug 管理以需求池 `work_demands` 为主关联对象，保留对旧字段的兼容读取能力。
- 统计口径改为“业务线 + 需求池 + Bug”组合口径。

## 二、数据模型规则

- 需求主数据以 `work_demands` 为准。
- `pm_bugs` 新增 `demand_id` 字段，指向 `work_demands.id`。
- `pm_bugs.requirement_id` 作为兼容字段保留，不再作为新功能主链路。

## 三、接口规则

- Bug 新增/编辑支持 `demand_id` 入参。
- Bug 列表和详情返回 `demand_id`、`demand_name`，用于前端展示“关联需求池”。
- 统计接口中的 `total_requirements`、`requirement_count` 基于 `work_demands` 聚合。

## 四、业务线统计口径

- 业务线维度继续使用 `pm_projects`（Wegic / A1）。
- 需求池数据通过 `pm_user_business_lines`（需求负责人 -> 业务线）映射到业务线。
- 业务线统计结果 = 需求池工时统计 + Bug 工时统计。

## 五、前端菜单规则

- 项目管理分组中，`/pm/requirements` 直接使用需求池页面组件。
- 主菜单不再重复展示 `/work-demands`，避免入口重复。
- Bug 表单“关联需求”统一改为“关联需求池”并提交 `demand_id`。
