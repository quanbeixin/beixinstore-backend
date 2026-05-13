# 需求价值复盘（V1）设计文档

## 1. 背景与目标

系统现有“需求评分”用于评估需求过程中的参与人表现，但缺少“需求上线后价值复盘”的结构化能力。  
V1 目标是提供一个可追溯、可管理、可沉淀的复盘闭环，用于管理决策与团队方法论优化，不直接用于绩效考核。

## 2. 范围与边界

### 2.1 In Scope（V1）

- 管理员在“上线计划表”对“已上线”需求手动发起价值复盘。
- 系统生成复盘任务，并进入“需求价值复盘”列表。
- 支持复盘详情填写、提交、标记“无需复盘”、撤销“无需复盘”。
- 复盘提交采用单一整体分（0-100）+ 三项必填复盘记录。
- 全流程留痕审计。

### 2.2 Out of Scope（V1 不做）

- 自动发起复盘任务。
- 维度化价值评分模型（多维度加权）。
- 非管理员协作填写或审批流。
- 与绩效/激励直接联动。
- 复杂 BI 看板和趋势分析（后续迭代）。

## 3. 入口与信息架构

### 3.1 入口

- 页面：上线计划表（`/launch-plan`）
- 条件：需求状态=“已上线”时显示复盘入口
- 权限：仅管理员可见与可操作

按钮规则：

- 未存在复盘任务：显示“发起价值复盘”
- 已存在复盘任务：显示“查看复盘”或“继续复盘”

### 3.2 菜单

- 模块：`project`
- 菜单名称：`需求价值复盘`
- 列表路由：`/demand-value-reviews`
- 详情路由：`/demand-value-reviews/:id`

## 4. 状态机与业务规则

### 4.1 状态定义

- `PENDING`：待复盘
- `IN_REVIEW`：复盘中
- `COMPLETED`：已完成
- `SKIPPED`：无需复盘（可逆）

### 4.2 状态流转

- 发起后：`PENDING`
- 开始编辑：`PENDING -> IN_REVIEW`
- 提交完成：`IN_REVIEW -> COMPLETED`
- 标记无需复盘：`PENDING/IN_REVIEW -> SKIPPED`
- 撤销无需复盘：`SKIPPED -> PENDING`

### 4.3 提交校验

提交 `COMPLETED` 时必填：

- `overall_score`（0-100，整数）
- `review_value_summary`（价值结论）
- `review_benefit_result`（收益结果）
- `review_improvement_notes`（经验与改进点）

标记 `SKIPPED` 时必填：

- `skip_reason`（无需复盘原因）

### 4.4 幂等约束

- 同一需求仅允许存在 1 条有效复盘任务（V1 默认唯一，不做多版本）。
- 点击“发起价值复盘”时，若已存在任务则不重复创建，直接返回现有任务。

## 5. 权限与审计

### 5.1 权限

V1 统一仅管理员可操作：

- 发起复盘
- 编辑复盘
- 提交复盘
- 标记无需复盘
- 撤销无需复盘

非管理员默认不开放列表与详情访问。

### 5.2 审计日志

记录字段：

- `review_id`
- 操作类型（发起/编辑/提交/标记无需复盘/撤销）
- 操作人
- 操作时间
- 前后状态
- 操作备注（如 skip_reason）

## 6. 页面结构

### 6.1 列表页（`/demand-value-reviews`）

筛选项：

- 需求 ID
- 需求名称
- 需求负责人
- 复盘状态
- 发起时间范围

列表列建议：

- 需求ID
- 需求名称
- 需求负责人
- 上线日期
- 复盘状态
- 价值评分（已完成显示）
- 最后更新时间
- 操作（查看/继续复盘）

### 6.2 详情页（`/demand-value-reviews/:id`）

区块：

1. 需求基础信息（只读）
2. 数据支撑（只读，自动聚合）
3. 价值评分（0-100）
4. 复盘记录（3项必填）
5. 操作日志（时间线或表格）

操作按钮：

- 保存草稿（维持 `IN_REVIEW`）
- 提交复盘（切 `COMPLETED`）
- 标记无需复盘（切 `SKIPPED`）
- 撤销无需复盘（`SKIPPED -> PENDING`）

## 7. 数据模型（后端）

### 7.1 主表 `demand_value_reviews`

核心字段建议：

- `id` BIGINT PK
- `demand_id` VARCHAR(64) UNIQUE NOT NULL
- `status` VARCHAR(32) NOT NULL
- `overall_score` INT NULL
- `review_value_summary` TEXT NULL
- `review_benefit_result` TEXT NULL
- `review_improvement_notes` TEXT NULL
- `skip_reason` TEXT NULL
- `created_by` INT NOT NULL
- `updated_by` INT NULL
- `created_at` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL
- `submitted_at` DATETIME NULL

### 7.2 日志表 `demand_value_review_logs`

核心字段建议：

- `id` BIGINT PK
- `review_id` BIGINT NOT NULL
- `action_type` VARCHAR(32) NOT NULL
- `from_status` VARCHAR(32) NULL
- `to_status` VARCHAR(32) NULL
- `action_note` TEXT NULL
- `operator_user_id` INT NOT NULL
- `created_at` DATETIME NOT NULL

## 8. API 草案

命名基于现有 `/api/work` 风格：

- `POST /api/work/demand-value-reviews/demands/:demandId/init`
  - 发起复盘（幂等）
- `GET /api/work/demand-value-reviews`
  - 列表查询
- `GET /api/work/demand-value-reviews/:id`
  - 详情查询（含日志）
- `PUT /api/work/demand-value-reviews/:id`
  - 保存草稿/更新内容（必要时将 `PENDING` 切 `IN_REVIEW`）
- `POST /api/work/demand-value-reviews/:id/submit`
  - 提交复盘（校验必填，切 `COMPLETED`）
- `POST /api/work/demand-value-reviews/:id/skip`
  - 标记无需复盘（必填 skip_reason）
- `POST /api/work/demand-value-reviews/:id/unskip`
  - 撤销无需复盘（切回 `PENDING`）
- `GET /api/work/demand-value-reviews/by-demand/:demandId`
  - 供上线计划表快速判断按钮态

## 9. 错误处理与提示文案

- 非管理员操作：`403 无权限执行该操作`
- 需求不存在：`404 需求不存在`
- 需求状态非已上线且尝试发起：`400 当前需求未上线，暂不可发起价值复盘`
- 提交缺少必填：`400 请完整填写价值评分与复盘记录后再提交`
- 标记无需复盘缺少原因：`400 请填写无需复盘原因`

## 10. 测试与验收标准

### 10.1 功能验收

- 已上线需求可在上线计划表看到复盘入口，且仅管理员可见。
- 入口幂等：重复点击不产生重复任务。
- 列表筛选、状态显示、操作跳转正确。
- 提交时严格校验 0-100 + 三项复盘记录必填。
- `SKIPPED` 可设置可撤销，且有原因留痕。

### 10.2 数据与安全

- 所有状态变更均有日志记录。
- 非管理员访问受限。
- 提交后数据可正确回显。

## 11. 迭代方向（V2+）

- 支持复盘维度化评分与权重。
- 支持复盘提醒机制。
- 支持复盘看板（分布、趋势、价值达成率）。
- 支持复盘模板化（按业务线差异化字段）。

