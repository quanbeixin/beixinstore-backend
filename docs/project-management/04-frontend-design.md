# 项目管理模块前端设计

## 设计原则

- 复用当前 React + Ant Design 后台风格
- 界面以简单、实用、易维护为主
- 以“列表 + 弹窗 + 详情页”作为主要交互模式
- 保持与现有路由配置、菜单配置方式一致
- 前端展示层可将“项目”文案统一映射为“业务线”，但后端接口和数据模型仍沿用 `project` 命名

## 新增前端模块

### API 文件

- `src/api/projects.js`
- `src/api/requirements.js`
- `src/api/bugs.js`
- `src/api/projectStats.js`

这些文件用于封装新增后端接口，风格保持和现有 API 模块一致。

### 页面文件

- `src/pages/Projects.jsx`
- `src/pages/ProjectDetail.jsx`
- `src/pages/Requirements.jsx`
- `src/pages/Bugs.jsx`
- `src/pages/ProjectStats.jsx`

可选的后续页面：

- `src/pages/ProjectBoard.jsx`

### 可复用组件

- `src/components/project/ProjectFormModal.jsx`
- `src/components/project/ProjectMemberModal.jsx`
- `src/components/project/ProjectStatusTag.jsx`
- `src/components/requirement/RequirementFormModal.jsx`
- `src/components/requirement/RequirementStatusTag.jsx`
- `src/components/bug/BugFormModal.jsx`
- `src/components/bug/BugSeverityTag.jsx`
- `src/components/stats/HoursSummaryCards.jsx`
- `src/components/stats/ProjectHoursChart.jsx`

## 菜单设计

推荐新增一级菜单分组：

- `项目协作`

推荐二级菜单：

- `项目列表`
- `需求管理`
- `Bug 管理`
- `工时统计`

如果当前系统导航本身偏平铺，也可以按需要拆成一级菜单，但更推荐保持分组方式。

## 路由设计

推荐新增以下路由：

- `/projects`
- `/projects/:id`
- `/requirements`
- `/bugs`
- `/project-stats`

建议的路由配置示例：

```js
{
  path: '/projects',
  componentKey: 'projects',
  title: '项目列表',
}
{
  path: '/requirements',
  componentKey: 'requirements',
  title: '需求管理',
}
{
  path: '/bugs',
  componentKey: 'bugs',
  title: 'Bug 管理',
}
{
  path: '/project-stats',
  componentKey: 'projectStats',
  title: '工时统计',
}
```

## 页面级设计

## 1. 业务线列表页

### 主要目标

- 展示业务线列表
- 支持查询与筛选
- 支持新建、编辑、删除
- 支持进入业务线详情页

### 页面布局

- 顶部筛选区域
- 中间表格列表
- 右侧操作列
- 新建/编辑统一使用弹窗表单

### 筛选项

- 业务线名称关键词
- 业务线状态
- 业务线负责人

### 表格列

- 业务线名称
- 业务线编码
- 状态
- 负责人
- 成员数
- 开始日期
- 结束日期
- 创建时间
- 操作

### 操作

- 新建业务线
- 编辑
- 删除
- 查看详情

## 2. 业务线详情页

### 主要目标

- 展示业务线基础信息
- 展示业务线成员
- 展示关联需求
- 展示关联 Bug
- 展示最近操作日志

### 布局建议

- 顶部业务线概览卡片
- 下方使用 `Tabs`
  - 成员
  - 需求
  - Bug
  - 操作日志

### 详情内容

#### 基础信息卡片

- 业务线名称
- 业务线编码
- 业务线状态
- 业务线负责人
- 时间范围
- 业务线说明

#### 成员 Tab

- 成员列表
- 角色标签
- 添加成员按钮
- 修改成员角色
- 移除成员

#### 需求 Tab

- 关联需求表格
- 快速新建需求按钮

#### Bug Tab

- 关联 Bug 表格
- 快速新建 Bug 按钮

#### 日志 Tab

- 操作人
- 操作类型
- 对象类型
- 操作详情
- 时间

## 3. 需求管理页

### 主要目标

- 查看需求列表
- 创建与编辑需求
- 流转状态与阶段
- 指派负责人
- 维护工时

### 布局

- 筛选表单
- 需求表格
- 新建/编辑弹窗

### 筛选项

- 关键词
- 业务线
- 状态
- 优先级
- 负责人
- 阶段

### 表格列

- 标题
- 所属业务线
- 优先级
- 状态
- 阶段
- 负责人
- 预计工时
- 实际工时
- 截止日期
- 操作

### 行操作

- 编辑
- 修改状态
- 修改阶段
- 指派负责人
- 删除

## 4. Bug 管理页

### 主要目标

- 查看 Bug 列表
- 提交和编辑 Bug
- 指派开发
- 流转 Bug 状态
- 更新工时

### 布局

- 筛选表单
- Bug 表格
- 新建/编辑弹窗

### 筛选项

- 关键词
- 业务线
- 关联需求
- 严重程度
- 状态
- 指派人
- 阶段

### 表格列

- 标题
- 所属业务线
- 关联需求
- 严重程度
- 状态
- 阶段
- 指派开发
- 预计工时
- 实际工时
- 截止日期
- 操作

## 5. 工时统计页

### 主要目标

- 展示总览指标
- 展示按业务线统计的工时
- 展示按成员统计的工时

### 布局建议

- 顶部统计卡片
- 中间按业务线统计表格或柱状图
- 下方按成员统计表格

### 总览指标

- 业务线总数
- 进行中业务线数
- 已完成业务线数
- 需求总数
- Bug 总数
- 预计总工时
- 实际总工时
- 总人天

### 建议展示方式

- 第一版优先使用卡片和表格
- 图表可以在后续版本中逐步补充

## 组件设计建议

## ProjectFormModal

建议字段：

- `name`
- `project_code`
- `description`
- `status`
- `owner_user_id`
- `start_date`
- `end_date`

用途：

- 新建项目
- 编辑项目

## ProjectMemberModal

建议字段：

- `user_id`
- `project_role`

用途：

- 添加成员
- 修改成员角色

## RequirementFormModal

建议字段：

- `project_id`
- `title`
- `description`
- `priority`
- `status`
- `stage`
- `assignee_user_id`
- `estimated_hours`
- `actual_hours`
- `start_date`
- `due_date`

## BugFormModal

建议字段：

- `project_id`
- `requirement_id`
- `title`
- `description`
- `reproduce_steps`
- `severity`
- `status`
- `stage`
- `assignee_user_id`
- `estimated_hours`
- `actual_hours`
- `due_date`

## 标签组件

建议做独立标签组件统一颜色和展示逻辑：

- `ProjectStatusTag`
- `RequirementStatusTag`
- `BugSeverityTag`

这样可以减少页面里的重复判断逻辑，也方便后续统一改样式。

## 状态管理建议

MVP 阶段建议页面本地管理状态即可：

- 查询条件
- 列表 loading
- 弹窗开关
- 当前选中记录
- 表单状态

暂时不建议为此单独引入新的全局状态库。

## 权限处理建议

前端继续复用当前已有的访问控制工具函数。

例如：

- 没有 `project.create` 时隐藏“新建项目”按钮
- 没有 `project.edit` 时隐藏编辑按钮
- 没有 `project.stats.view` 时隐藏统计页面入口

## MVP 交互建议

- 列表页默认采用表格形式
- 新建/编辑统一走弹窗
- 详情使用独立页面
- 状态展示使用标签
- 聚合信息使用标签页
- 第一版不引入拖拽看板

## 实现顺序建议

推荐前端实现顺序：

1. 项目列表页
   前端实际展示文案为“业务线”
2. 项目新建/编辑弹窗
3. 需求管理页
4. Bug 管理页
5. 业务线详情页
6. 工时统计页
