SET NAMES utf8mb4;

SELECT
  COUNT(*) AS column_count
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'project_templates'
  AND COLUMN_NAME = 'group_chat_config';

SELECT
  id,
  name,
  JSON_UNQUOTE(JSON_EXTRACT(group_chat_config, '$.auto_group_chat_enabled')) AS auto_group_chat_enabled,
  JSON_UNQUOTE(JSON_EXTRACT(group_chat_config, '$.include_owner')) AS include_owner,
  JSON_LENGTH(group_chat_config, '$.default_member_user_ids') AS default_member_count
FROM project_templates
ORDER BY id DESC
LIMIT 20;
