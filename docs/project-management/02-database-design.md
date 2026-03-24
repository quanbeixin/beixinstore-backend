# 项目管理模块数据库设计

## 设计原则

- 以新增表为主，不重写现有核心表
- 外键继续关联现有 `users` 表
- 状态字段使用 `VARCHAR`，方便后续扩展
- 工时统一使用 `DECIMAL(10,2)`
- 为后续版本预留扩展空间

## 新增表

- `pm_projects`
- `pm_project_members`
- `pm_requirements`
- `pm_bugs`
- `pm_activity_logs`

## 初始化 SQL

```sql
CREATE TABLE IF NOT EXISTS pm_projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT '项目名称',
  project_code VARCHAR(50) DEFAULT NULL COMMENT '项目编码，可选',
  description TEXT DEFAULT NULL COMMENT '项目描述',
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' COMMENT '项目状态：IN_PROGRESS / COMPLETED',
  owner_user_id INT DEFAULT NULL COMMENT '项目负责人',
  start_date DATE DEFAULT NULL COMMENT '开始日期',
  end_date DATE DEFAULT NULL COMMENT '结束日期',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否删除',
  created_by INT DEFAULT NULL COMMENT '创建人',
  updated_by INT DEFAULT NULL COMMENT '更新人',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pm_projects_name (name),
  UNIQUE KEY uk_pm_projects_code (project_code),
  KEY idx_pm_projects_status (status),
  KEY idx_pm_projects_owner_user_id (owner_user_id),
  KEY idx_pm_projects_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目表';

CREATE TABLE IF NOT EXISTS pm_project_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '项目ID',
  user_id INT NOT NULL COMMENT '用户ID',
  project_role VARCHAR(20) NOT NULL DEFAULT 'DEV' COMMENT '项目内角色：PM / DEV / QA',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否删除',
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  created_by INT DEFAULT NULL COMMENT '操作人',
  updated_by INT DEFAULT NULL COMMENT '更新人',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pm_project_members_project_user (project_id, user_id),
  KEY idx_pm_project_members_user_id (user_id),
  KEY idx_pm_project_members_project_role (project_role),
  CONSTRAINT fk_pm_project_members_project_id
    FOREIGN KEY (project_id) REFERENCES pm_projects(id),
  CONSTRAINT fk_pm_project_members_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目成员表';

CREATE TABLE IF NOT EXISTS pm_requirements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目ID',
  title VARCHAR(200) NOT NULL COMMENT '需求标题',
  description TEXT DEFAULT NULL COMMENT '需求描述',
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' COMMENT '优先级：LOW / MEDIUM / HIGH / URGENT',
  status VARCHAR(20) NOT NULL DEFAULT 'TODO' COMMENT '状态：TODO / IN_PROGRESS / DONE',
  stage VARCHAR(20) NOT NULL DEFAULT 'REQUIREMENT' COMMENT '阶段：REQUIREMENT / DEVELOPMENT / TEST / RELEASE',
  assignee_user_id INT DEFAULT NULL COMMENT '负责人',
  estimated_hours DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '预计工时',
  actual_hours DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '实际工时',
  start_date DATE DEFAULT NULL COMMENT '开始日期',
  due_date DATE DEFAULT NULL COMMENT '截止日期',
  completed_at DATETIME DEFAULT NULL COMMENT '完成时间',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否删除',
  created_by INT DEFAULT NULL COMMENT '创建人',
  updated_by INT DEFAULT NULL COMMENT '更新人',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pm_requirements_project_id (project_id),
  KEY idx_pm_requirements_status (status),
  KEY idx_pm_requirements_stage (stage),
  KEY idx_pm_requirements_priority (priority),
  KEY idx_pm_requirements_assignee_user_id (assignee_user_id),
  CONSTRAINT fk_pm_requirements_project_id
    FOREIGN KEY (project_id) REFERENCES pm_projects(id),
  CONSTRAINT fk_pm_requirements_assignee_user_id
    FOREIGN KEY (assignee_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='需求表';

CREATE TABLE IF NOT EXISTS pm_bugs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目ID',
  requirement_id INT DEFAULT NULL COMMENT '关联需求ID，可为空',
  title VARCHAR(200) NOT NULL COMMENT 'Bug 标题',
  description TEXT DEFAULT NULL COMMENT 'Bug 描述',
  reproduce_steps TEXT DEFAULT NULL COMMENT '复现步骤',
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' COMMENT '严重程度：LOW / MEDIUM / HIGH / CRITICAL',
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' COMMENT '状态：OPEN / FIXING / VERIFIED / CLOSED',
  stage VARCHAR(20) NOT NULL DEFAULT 'DEVELOPMENT' COMMENT '阶段：DEVELOPMENT / TEST / RELEASE',
  assignee_user_id INT DEFAULT NULL COMMENT '指派开发',
  estimated_hours DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '预计工时',
  actual_hours DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '实际工时',
  due_date DATE DEFAULT NULL COMMENT '截止日期',
  resolved_at DATETIME DEFAULT NULL COMMENT '修复时间',
  verified_at DATETIME DEFAULT NULL COMMENT '验证时间',
  closed_at DATETIME DEFAULT NULL COMMENT '关闭时间',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否删除',
  created_by INT DEFAULT NULL COMMENT '创建人',
  updated_by INT DEFAULT NULL COMMENT '更新人',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pm_bugs_project_id (project_id),
  KEY idx_pm_bugs_requirement_id (requirement_id),
  KEY idx_pm_bugs_status (status),
  KEY idx_pm_bugs_severity (severity),
  KEY idx_pm_bugs_assignee_user_id (assignee_user_id),
  CONSTRAINT fk_pm_bugs_project_id
    FOREIGN KEY (project_id) REFERENCES pm_projects(id),
  CONSTRAINT fk_pm_bugs_requirement_id
    FOREIGN KEY (requirement_id) REFERENCES pm_requirements(id),
  CONSTRAINT fk_pm_bugs_assignee_user_id
    FOREIGN KEY (assignee_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='缺陷表';

CREATE TABLE IF NOT EXISTS pm_activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT DEFAULT NULL COMMENT '项目ID',
  requirement_id INT DEFAULT NULL COMMENT '需求ID',
  bug_id INT DEFAULT NULL COMMENT 'Bug ID',
  entity_type VARCHAR(20) NOT NULL COMMENT '对象类型：PROJECT / REQUIREMENT / BUG',
  entity_id INT NOT NULL COMMENT '对象ID',
  action VARCHAR(50) NOT NULL COMMENT '动作：CREATE / UPDATE / DELETE / ASSIGN / STATUS_CHANGE / HOURS_UPDATE',
  action_detail TEXT DEFAULT NULL COMMENT '动作详情',
  operator_user_id INT DEFAULT NULL COMMENT '操作人',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pm_activity_logs_project_id (project_id),
  KEY idx_pm_activity_logs_requirement_id (requirement_id),
  KEY idx_pm_activity_logs_bug_id (bug_id),
  KEY idx_pm_activity_logs_entity (entity_type, entity_id),
  KEY idx_pm_activity_logs_operator_user_id (operator_user_id),
  CONSTRAINT fk_pm_activity_logs_project_id
    FOREIGN KEY (project_id) REFERENCES pm_projects(id),
  CONSTRAINT fk_pm_activity_logs_requirement_id
    FOREIGN KEY (requirement_id) REFERENCES pm_requirements(id),
  CONSTRAINT fk_pm_activity_logs_bug_id
    FOREIGN KEY (bug_id) REFERENCES pm_bugs(id),
  CONSTRAINT fk_pm_activity_logs_operator_user_id
    FOREIGN KEY (operator_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目管理模块操作日志表';
```

## 建议字典值

### 项目状态

- `IN_PROGRESS`
- `COMPLETED`

### 项目成员角色

- `PM`
- `DEV`
- `QA`

### 需求优先级

- `LOW`
- `MEDIUM`
- `HIGH`
- `URGENT`

### 需求状态

- `TODO`
- `IN_PROGRESS`
- `DONE`

### 需求阶段

- `REQUIREMENT`
- `DEVELOPMENT`
- `TEST`
- `RELEASE`

### Bug 严重程度

- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

### Bug 状态

- `OPEN`
- `FIXING`
- `VERIFIED`
- `CLOSED`

### Bug 阶段

- `DEVELOPMENT`
- `TEST`
- `RELEASE`

## 建议权限初始化数据

```sql
INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
VALUES
('project.view', '查看项目', 'project_management', 1),
('project.create', '创建项目', 'project_management', 1),
('project.edit', '编辑项目', 'project_management', 1),
('project.delete', '删除项目', 'project_management', 1),
('project.member.manage', '管理项目成员', 'project_management', 1),
('requirement.view', '查看需求', 'project_management', 1),
('requirement.create', '创建需求', 'project_management', 1),
('requirement.edit', '编辑需求', 'project_management', 1),
('requirement.transition', '流转需求状态', 'project_management', 1),
('bug.view', '查看缺陷', 'project_management', 1),
('bug.create', '创建缺陷', 'project_management', 1),
('bug.edit', '编辑缺陷', 'project_management', 1),
('bug.transition', '流转缺陷状态', 'project_management', 1),
('project.stats.view', '查看项目统计', 'project_management', 1);
```
