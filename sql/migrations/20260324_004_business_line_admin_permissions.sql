-- 业务线管理员角色与权限补丁（幂等）
-- 目标：
-- 1) 若 BUSINESS_LINE_ADMIN 已存在，则只更新属性，不重复创建
-- 2) 为 ADMIN 与 BUSINESS_LINE_ADMIN 补齐项目管理/需求池相关权限
-- 3) ADMIN 额外同步全量权限（与 SUPER_ADMIN 的权限集合对齐，数据范围仍受业务线逻辑约束）

INSERT INTO roles (name, role_key, role_level, enabled, is_builtin, description)
VALUES ('业务线管理员', 'BUSINESS_LINE_ADMIN', 60, 1, 1, '仅可管理所属业务线数据')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  role_level = VALUES(role_level),
  enabled = VALUES(enabled),
  is_builtin = VALUES(is_builtin),
  description = VALUES(description);

INSERT INTO permissions (permission_code, permission_name, module_key, enabled, name, description)
VALUES
  ('business_line.switch', '切换业务线', 'project_management', 1, '切换业务线', '切换当前业务线上下文')
ON DUPLICATE KEY UPDATE
  permission_name = VALUES(permission_name),
  module_key = VALUES(module_key),
  enabled = VALUES(enabled),
  name = VALUES(name),
  description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.permission_code IN (
    'project.view',
    'project.create',
    'project.edit',
    'project.delete',
    'project.member.manage',
    'requirement.view',
    'requirement.create',
    'requirement.edit',
    'requirement.transition',
    'bug.view',
    'bug.create',
    'bug.edit',
    'bug.transition',
    'project.stats.view',
    'demand.view',
    'demand.manage',
    'demand.workflow.manage',
    'worklog.view.self',
    'worklog.create',
    'worklog.update.self',
    'workbench.view.self',
    'workbench.view.owner'
  )
WHERE UPPER(r.role_key) IN ('ADMIN', 'BUSINESS_LINE_ADMIN');

-- 按你的要求，系统管理员与超管权限集合对齐（ADMIN 同步全量权限）
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE UPPER(r.role_key) = 'ADMIN';
