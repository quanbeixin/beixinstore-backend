-- Verify self task difficulty support

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'work_logs'
  AND COLUMN_NAME = 'self_task_difficulty_code';

SELECT INDEX_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'work_logs'
  AND INDEX_NAME = 'idx_self_task_difficulty_code';

SELECT type_key, item_code, item_name, enabled
FROM config_dict_items
WHERE type_key = 'task_difficulty'
ORDER BY sort_order, item_code;
