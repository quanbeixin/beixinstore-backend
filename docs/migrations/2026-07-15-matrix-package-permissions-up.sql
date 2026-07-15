SET NAMES utf8mb4;

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'matrix_package.view', '查看矩阵包专项', 'matrix_package', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'matrix_package.view'
);

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'matrix_package.manage', '管理矩阵包专项', 'matrix_package', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'matrix_package.manage'
);

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'matrix_package.notification.manage', '管理矩阵包通知配置', 'matrix_package', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'matrix_package.notification.manage'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p
  ON p.permission_code IN (
    'matrix_package.view',
    'matrix_package.manage',
    'matrix_package.notification.manage'
  )
LEFT JOIN role_permissions rp
  ON rp.role_id = r.id
 AND rp.permission_id = p.id
WHERE rp.role_id IS NULL
  AND UPPER(COALESCE(r.role_key, '')) IN ('SUPER_ADMIN', 'ADMIN');
