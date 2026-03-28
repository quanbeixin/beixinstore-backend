-- Project Management V3 Permission Hardening (UP)
-- Generated: 2026-03-28
-- Goal:
-- 1) Restrict project template / notification config permissions to ADMIN + SUPER_ADMIN.
-- 2) Remove broad grants from other roles.

SET NAMES utf8mb4;

-- 0) Ensure target permissions exist (idempotent safeguard)
INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'project.template.view', '查看项目模板', 'work', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'project.template.view'
);

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'project.template.manage', '管理项目模板', 'work', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'project.template.manage'
);

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'notification.config.view', '查看通知配置', 'work', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'notification.config.view'
);

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'notification.config.manage', '管理通知配置', 'work', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'notification.config.manage'
);

-- 1) Remove these permissions from non-admin roles
DELETE rp
FROM role_permissions rp
INNER JOIN permissions p ON p.id = rp.permission_id
INNER JOIN roles r ON r.id = rp.role_id
WHERE p.permission_code IN (
  'project.template.view',
  'project.template.manage',
  'notification.config.view',
  'notification.config.manage'
)
AND NOT (
  UPPER(COALESCE(r.role_key, '')) IN ('ADMIN', 'SUPER_ADMIN')
  OR r.name IN ('管理员', '超级管理员')
);

-- 2) Ensure ADMIN + SUPER_ADMIN have all four permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p
  ON p.permission_code IN (
    'project.template.view',
    'project.template.manage',
    'notification.config.view',
    'notification.config.manage'
  )
LEFT JOIN role_permissions rp
  ON rp.role_id = r.id
 AND rp.permission_id = p.id
WHERE rp.role_id IS NULL
  AND COALESCE(r.enabled, 1) = 1
  AND (
    UPPER(COALESCE(r.role_key, '')) IN ('ADMIN', 'SUPER_ADMIN')
    OR r.name IN ('管理员', '超级管理员')
  );
