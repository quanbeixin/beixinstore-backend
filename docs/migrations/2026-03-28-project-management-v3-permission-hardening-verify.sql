-- Project Management V3 Permission Hardening (VERIFY)

SET NAMES utf8mb4;

SELECT
  r.id AS role_id,
  r.name AS role_name,
  COALESCE(r.role_key, '') AS role_key,
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
ORDER BY r.id ASC, p.permission_code ASC;

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
ORDER BY p.permission_code ASC;
