SELECT
  'bugs' AS table_name,
  COUNT(*) AS matched
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bugs';

SELECT
  'bug_status_logs' AS table_name,
  COUNT(*) AS matched
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_status_logs';

SELECT
  'bug_attachments' AS table_name,
  COUNT(*) AS matched
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_attachments';

SELECT
  type_key,
  type_name,
  enabled
FROM config_dict_types
WHERE type_key IN ('bug_status', 'bug_severity', 'bug_priority', 'bug_type', 'bug_product')
ORDER BY type_key ASC;

SELECT
  type_key,
  item_code,
  item_name,
  enabled
FROM config_dict_items
WHERE type_key IN ('bug_status', 'bug_severity', 'bug_priority', 'bug_type', 'bug_product')
ORDER BY type_key ASC, sort_order ASC, id ASC;

SELECT
  permission_code,
  permission_name
FROM permissions
WHERE permission_code IN ('bug.view', 'bug.create', 'bug.update', 'bug.transition', 'bug.manage', 'bug.delete')
ORDER BY permission_code ASC;

SELECT
  scene,
  enabled,
  advance_days
FROM notification_config
WHERE scene IN ('bug_assign', 'bug_status_change', 'bug_fixed', 'bug_reopen')
ORDER BY scene ASC;
