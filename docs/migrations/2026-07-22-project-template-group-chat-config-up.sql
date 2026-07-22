SET NAMES utf8mb4;

SET @has_group_chat_config := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'project_templates'
    AND COLUMN_NAME = 'group_chat_config'
);

SET @sql := IF(
  @has_group_chat_config = 0,
  'ALTER TABLE `project_templates` ADD COLUMN `group_chat_config` JSON NULL COMMENT ''自动拉群配置'' AFTER `node_config`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `project_templates`
SET `group_chat_config` = CAST('{"auto_group_chat_enabled":true,"include_owner":true,"default_member_user_ids":[]}' AS JSON)
WHERE `group_chat_config` IS NULL;
