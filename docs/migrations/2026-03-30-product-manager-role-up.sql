-- Product manager role bootstrap
-- Generated: 2026-03-30
-- Scope:
-- 1) Create PRODUCT_MANAGER role if missing
-- 2) Grant minimal permissions for demand access and creation

SET NAMES utf8mb4;

INSERT INTO roles (name, role_key, role_level, enabled, is_builtin)
SELECT '产品经理', 'PRODUCT_MANAGER', 20, 1, 0
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE UPPER(COALESCE(role_key, '')) = 'PRODUCT_MANAGER'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.permission_code IN ('demand.view', 'demand.create')
LEFT JOIN role_permissions rp
  ON rp.role_id = r.id
 AND rp.permission_id = p.id
WHERE UPPER(COALESCE(r.role_key, '')) = 'PRODUCT_MANAGER'
  AND rp.role_id IS NULL;

SELECT
  r.id AS role_id,
  r.name AS role_name,
  r.role_key,
  r.role_level,
  r.enabled,
  r.is_builtin
FROM roles r
WHERE UPPER(COALESCE(r.role_key, '')) = 'PRODUCT_MANAGER';

SELECT
  r.name AS role_name,
  p.permission_code,
  p.permission_name
FROM roles r
INNER JOIN role_permissions rp ON rp.role_id = r.id
INNER JOIN permissions p ON p.id = rp.permission_id
WHERE UPPER(COALESCE(r.role_key, '')) = 'PRODUCT_MANAGER'
ORDER BY p.permission_code ASC;
