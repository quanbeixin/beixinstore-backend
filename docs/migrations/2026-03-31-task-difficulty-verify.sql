-- Verify task difficulty support

SET NAMES utf8mb4;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'work_logs'
  AND COLUMN_NAME = 'task_difficulty_code';

SELECT
  INDEX_NAME,
  COLUMN_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'work_logs'
  AND INDEX_NAME = 'idx_task_difficulty_code';

SELECT
  type_key,
  type_name,
  enabled,
  is_builtin
FROM config_dict_types
WHERE type_key = 'task_difficulty';

SELECT
  item_code,
  item_name,
  sort_order,
  enabled,
  color
FROM config_dict_items
WHERE type_key = 'task_difficulty'
ORDER BY sort_order ASC, id ASC;
