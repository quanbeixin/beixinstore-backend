-- Project Management V2 Permissions (UP)
-- Generated: 2026-03-28
-- Scope:
-- 1) Add fine-grained permission codes for project template and notification config.
-- 2) Backfill role_permissions from existing demand.view / demand.manage grants.

SET NAMES utf8mb4;

-- 1) Register new permissions (idempotent)
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

-- 2) Backfill role grants from old demand permissions
-- 2.1 project.template.view <= demand.view OR demand.manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT src.role_id, target.id
FROM (
  SELECT DISTINCT rp.role_id
  FROM role_permissions rp
  INNER JOIN permissions p_old ON p_old.id = rp.permission_id
  WHERE p_old.permission_code IN ('demand.view', 'demand.manage')
) src
INNER JOIN permissions target ON target.permission_code = 'project.template.view'
LEFT JOIN role_permissions rp_exists
  ON rp_exists.role_id = src.role_id
 AND rp_exists.permission_id = target.id
WHERE rp_exists.role_id IS NULL;

-- 2.2 project.template.manage <= demand.manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT src.role_id, target.id
FROM (
  SELECT DISTINCT rp.role_id
  FROM role_permissions rp
  INNER JOIN permissions p_old ON p_old.id = rp.permission_id
  WHERE p_old.permission_code = 'demand.manage'
) src
INNER JOIN permissions target ON target.permission_code = 'project.template.manage'
LEFT JOIN role_permissions rp_exists
  ON rp_exists.role_id = src.role_id
 AND rp_exists.permission_id = target.id
WHERE rp_exists.role_id IS NULL;

-- 2.3 notification.config.view <= demand.view OR demand.manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT src.role_id, target.id
FROM (
  SELECT DISTINCT rp.role_id
  FROM role_permissions rp
  INNER JOIN permissions p_old ON p_old.id = rp.permission_id
  WHERE p_old.permission_code IN ('demand.view', 'demand.manage')
) src
INNER JOIN permissions target ON target.permission_code = 'notification.config.view'
LEFT JOIN role_permissions rp_exists
  ON rp_exists.role_id = src.role_id
 AND rp_exists.permission_id = target.id
WHERE rp_exists.role_id IS NULL;

-- 2.4 notification.config.manage <= demand.manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT src.role_id, target.id
FROM (
  SELECT DISTINCT rp.role_id
  FROM role_permissions rp
  INNER JOIN permissions p_old ON p_old.id = rp.permission_id
  WHERE p_old.permission_code = 'demand.manage'
) src
INNER JOIN permissions target ON target.permission_code = 'notification.config.manage'
LEFT JOIN role_permissions rp_exists
  ON rp_exists.role_id = src.role_id
 AND rp_exists.permission_id = target.id
WHERE rp_exists.role_id IS NULL;
