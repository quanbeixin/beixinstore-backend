-- Project Management V2 Permissions (VERIFY)

SET NAMES utf8mb4;

SELECT
  p.id,
  p.permission_code,
  p.permission_name,
  p.module_key,
  p.enabled
FROM permissions p
WHERE p.permission_code IN (
  'project.template.view',
  'project.template.manage',
  'notification.config.view',
  'notification.config.manage'
)
ORDER BY p.permission_code;

SELECT
  p.permission_code,
  COUNT(DISTINCT rp.role_id) AS role_count
FROM permissions p
LEFT JOIN role_permissions rp ON rp.permission_id = p.id
WHERE p.permission_code IN (
  'project.template.view',
  'project.template.manage',
  'notification.config.view',
  'notification.config.manage'
)
GROUP BY p.permission_code
ORDER BY p.permission_code;

SELECT
  r.id AS role_id,
  r.name AS role_name,
  p.permission_code
FROM role_permissions rp
INNER JOIN roles r ON r.id = rp.role_id
INNER JOIN permissions p ON p.id = rp.permission_id
WHERE p.permission_code IN (
  'project.template.view',
  'project.template.manage',
  'notification.config.view',
  'notification.config.manage'
)
ORDER BY r.id, p.permission_code;
