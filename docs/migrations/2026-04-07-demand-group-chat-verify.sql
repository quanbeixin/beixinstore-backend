-- Verify demand group chat setting fields

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'work_demands'
  AND COLUMN_NAME IN ('group_chat_mode', 'group_chat_id')
ORDER BY COLUMN_NAME;

SELECT
  INDEX_NAME,
  COLUMN_NAME,
  SEQ_IN_INDEX
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'work_demands'
  AND INDEX_NAME = 'idx_work_demands_group_chat_mode';
