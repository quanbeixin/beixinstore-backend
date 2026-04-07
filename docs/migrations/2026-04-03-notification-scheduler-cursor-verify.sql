-- Verify notification scheduler cursor table

SELECT
  COUNT(*) AS table_exists
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'notification_trigger_cursor';

SELECT
  COUNT(*) AS key_exists
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'notification_trigger_cursor'
  AND index_name = 'uk_rule_trigger_key';
