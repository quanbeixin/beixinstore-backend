-- Notification rules: merge template text into rule itself
-- Date: 2026-04-02

-- Idempotent migration:
-- 1) Skip when table does not exist.
-- 2) Add columns/index only when missing.

SET @table_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notification_rules'
);

SET @has_message_title := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notification_rules'
    AND COLUMN_NAME = 'message_title'
);

SET @sql := IF(
  @table_exists = 0 OR @has_message_title > 0,
  'SELECT ''[skip] notification_rules.message_title already exists or table missing'' AS message',
  'ALTER TABLE notification_rules ADD COLUMN message_title VARCHAR(255) NULL COMMENT ''规则通知标题模板'' AFTER template_id'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_message_content := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notification_rules'
    AND COLUMN_NAME = 'message_content'
);

SET @sql := IF(
  @table_exists = 0 OR @has_message_content > 0,
  'SELECT ''[skip] notification_rules.message_content already exists or table missing'' AS message',
  'ALTER TABLE notification_rules ADD COLUMN message_content TEXT NULL COMMENT ''规则通知内容模板'' AFTER message_title'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notification_rules'
    AND INDEX_NAME = 'idx_notification_rules_event_enabled'
);

SET @sql := IF(
  @table_exists = 0 OR @has_index > 0,
  'SELECT ''[skip] idx_notification_rules_event_enabled already exists or table missing'' AS message',
  'ALTER TABLE notification_rules ADD INDEX idx_notification_rules_event_enabled (event_type, enabled)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Execute the following statements only if `notification_rule` table exists:
-- ALTER TABLE notification_rule
--   ADD COLUMN message_title VARCHAR(255) NULL COMMENT '规则通知标题模板' AFTER receiver_config_json;
-- ALTER TABLE notification_rule
--   ADD COLUMN message_content TEXT NULL COMMENT '规则通知内容模板' AFTER message_title;
