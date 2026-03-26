# 业务线流程模板（兼容策略）规则说明

## 目标

- 需求流程升级为“按业务线可配置”。
- 配置权限下放给业务线管理员，不依赖超管日常维护。
- 历史需求继续沿用旧流程，新需求走新模板实例，保证平滑迁移。
- 字典中心“需求阶段”保留为候选词库，不作为运行时唯一来源。

## 兼容策略

### 字典中心（需求阶段）

- 保留 `demand_phase` / `requirement_stage` / `demand_phase_type` 字典类型。
- 字典项定位为候选配置（`candidate_only`）。
- 运行时流程以 `pm_workflow_templates` + `pm_workflow_template_nodes` 为准。

### 历史需求与新需求

- 已创建的历史流程实例不受模板调整影响。
- 模板发布后仅影响后续新建需求。
- 需求创建时尝试自动创建模板流程实例，失败不阻塞需求创建（返回 warning）。

## 权限规则

- 模板查看：`demand.workflow.template.view`
- 模板编辑：`demand.workflow.template.edit`
- 模板发布/设默认：`demand.workflow.template.publish`
- 模板实例流转：`demand.workflow.instance.transition`

说明：前端展示与操作需按以上权限拆分判断，避免用 `demand.view` 误代模板权限。

## 流转规则（统一）

- 仅允许顺序流转到“下一节点”（`sort_order + 1`）。
- 允许回退，但只能回退到当前节点 `allow_return_to_keys` 白名单中的节点。
- 禁止跳级流转（例如从 1 直接到 3）。
- 禁止流转到当前节点自身。
- 流程实例状态非 `IN_PROGRESS` 时禁止流转。
- 回退时会将目标节点之后到当前节点之间的节点重置为 `PENDING`，用于重走流程。

## 日志规则（统一）

- 模板实例流转日志仅在模型层写入，避免 controller 与 model 重复写日志。
- 日志查询返回 `operator_name`（优先 `real_name`，否则 `username`），前端应优先显示姓名。

## 已落地范围（当前）

- 数据库 migration：
  - `sql/migrations/20260325_005_workflow_template_foundation.sql`
  - `sql/migrations/20260325_006_workflow_permissions_and_dict_compat.sql`
- 后端模块：
  - `routes/workflowTemplateRoutes.js`
  - `routes/workflowInstanceRoutes.js`
  - `controllers/workflowTemplateController.js`
  - `controllers/workflowInstanceController.js`
  - `models/WorkflowTemplate.js`
  - `models/WorkflowInstance.js`
  - `models/WorkflowOperationLog.js`
- 服务挂载：
  - `/api/workflow/templates`
  - `/api/workflow/instances`
- 前端：
  - 流程模板管理页（MVP）
  - 需求详情页新增“流程模板（业务线）”只读展示
  - 需求详情页支持模板实例流转与模板日志查看（按权限）

## 后续建议

- 增加模板节点合法性校验（唯一 key、顺序约束、最少节点数）。
- 流转策略升级为“允许迁移边”模型，避免任意跳转。
- 日志补充操作者姓名快照，前端可直接展示姓名而非 ID。
