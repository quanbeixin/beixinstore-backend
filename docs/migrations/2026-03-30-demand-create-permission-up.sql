-- Demand create permission
-- Generated: 2026-03-30
-- Scope:
-- 1) Add fine-grained permission `demand.create`
-- 2) Grant to ADMIN / SUPER_ADMIN / product roles by default

SET NAMES utf8mb4;

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'demand.create', '新建需求', 'work', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'demand.create'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.permission_code = 'demand.create'
LEFT JOIN role_permissions rp
  ON rp.role_id = r.id
 AND rp.permission_id = p.id
WHERE rp.role_id IS NULL
  AND (
    UPPER(COALESCE(r.role_key, '')) IN ('SUPER_ADMIN', 'ADMIN', 'PRODUCT_MANAGER', 'PRODUCT', 'PM')
    OR LOWER(COALESCE(r.name, '')) LIKE '%产品%'
    OR LOWER(COALESCE(r.name, '')) LIKE '%product%'
  );

SELECT
  p.permission_code,
  p.permission_name,
  r.id AS role_id,
  r.name AS role_name,
  r.role_key
FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id
INNER JOIN roles r ON r.id = rp.role_id
WHERE p.permission_code = 'demand.create'
ORDER BY r.id ASC;
