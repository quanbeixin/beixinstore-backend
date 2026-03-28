-- Project Management V2 Permissions (DOWN / rollback)
-- Warning: this script removes the new permission codes and role bindings.

SET NAMES utf8mb4;

DELETE rp
FROM role_permissions rp
INNER JOIN permissions p ON p.id = rp.permission_id
WHERE p.permission_code IN (
  'project.template.view',
  'project.template.manage',
  'notification.config.view',
  'notification.config.manage'
);

DELETE FROM permissions
WHERE permission_code IN (
  'project.template.view',
  'project.template.manage',
  'notification.config.view',
  'notification.config.manage'
);
