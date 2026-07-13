SET NAMES utf8mb4;

INSERT INTO roles (name, role_key, role_level, enabled, is_builtin)
SELECT '发版管理员', 'APP_RELEASE_MANAGER', 30, 1, 0
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE UPPER(COALESCE(role_key, '')) = 'APP_RELEASE_MANAGER'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p
  ON p.permission_code IN ('demand.view', 'demand.manage')
LEFT JOIN role_permissions rp
  ON rp.role_id = r.id
 AND rp.permission_id = p.id
WHERE UPPER(COALESCE(r.role_key, '')) = 'APP_RELEASE_MANAGER'
  AND rp.role_id IS NULL;
