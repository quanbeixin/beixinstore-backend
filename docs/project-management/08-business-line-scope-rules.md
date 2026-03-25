# 业务线数据收口统一规则（工作台与日志）

## 目标

- 工作台与日志查询统一按当前业务线（`active_project_id`）收口。
- 避免任何边角场景出现跨业务线可见。
- 统一后端口径，保证超级管理员切换业务线后，查询结果随切换即时收敛。

## 统一口径

- 业务线作用域来源：`businessLineScope` 中的 `active_project_id`。
- 查询类接口只返回当前业务线数据。
- 负责人操作权限（如指派、维护 Owner 预估）在原有“部门负责人范围”之上，再叠加业务线过滤。

## 本批落地范围

- 工作日志查询：`GET /api/work/logs`
- 个人工作台：`GET /api/work/workbench/me`
- Owner 工作台：`GET /api/work/workbench/owner`
- 未填报提醒预览：`POST /api/work/reminders/no-fill`
- 个人流程待办（工作台聚合项）：`Workflow.listMyOpenTasks`

## 关键实现点

- `Work.listLogs` 新增 `accessProjectId`，按 `work_logs.user_id -> pm_user_business_lines` 过滤。
- `Work.getMyWorkbench` 新增 `accessProjectId`，`today / active_items / recent_logs` 均按业务线过滤。
- `Work.getOwnerWorkbench` 新增 `accessProjectId`，负责人范围与待估算事项统一叠加业务线条件。
- `resolveOwnerScope` 新增 `accessProjectId`，部门负责人可管理成员集按业务线裁剪。
- `Work.canManageAssigneeByOwner`、`Work.canManageLogByDepartmentOwner` 新增 `accessProjectId`，避免跨线操作。
- `Workflow.listMyOpenTasks` 新增 `accessProjectId`，个人待办按需求所属业务线过滤。
- `workController` 统一透传 `getScopedProjectId(req)` 到上述模型方法。

## 验证建议

- 使用超管切换到 `Wegic` 与 `A1` 分别访问上述接口，确认返回集合差异符合预期。
- 使用业务线管理员账号验证：
  - 能看到本业务线数据；
  - 看不到其他业务线数据；
  - 不能对其他业务线成员做 Owner 指派/预估操作。
- 校验日志查询 `scope=team` 场景，确认同部门但跨业务线成员不会被返回。
