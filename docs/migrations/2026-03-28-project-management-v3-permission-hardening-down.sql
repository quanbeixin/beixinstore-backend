-- Project Management V3 Permission Hardening (DOWN / rollback)
-- Rollback policy: re-grant v2-style broad permissions based on demand.view/manage.

SET NAMES utf8mb4;

-- Re-grant project.template.view <= demand.view OR demand.manage
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

-- Re-grant project.template.manage <= demand.manage
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

-- Re-grant notification.config.view <= demand.view OR demand.manage
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

-- Re-grant notification.config.manage <= demand.manage
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
