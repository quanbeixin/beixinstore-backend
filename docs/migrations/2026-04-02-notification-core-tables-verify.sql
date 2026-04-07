-- Notification core tables bootstrap (VERIFY)
-- Date: 2026-04-02

SELECT
  TABLE_NAME,
  ENGINE,
  TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('notification_rules', 'notification_rule_receivers', 'notification_logs')
ORDER BY TABLE_NAME;

SELECT
  TABLE_NAME,
  COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'notification_rules'
  AND COLUMN_NAME IN ('message_title', 'message_content')
ORDER BY COLUMN_NAME;

