-- Verify job level dictionary + users.job_level column

SET NAMES utf8mb4;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'job_level';

SELECT
  type_key,
  type_name,
  enabled,
  is_builtin
FROM config_dict_types
WHERE type_key = 'job_level';

SELECT
  item_code,
  item_name,
  sort_order,
  enabled,
  color
FROM config_dict_items
WHERE type_key = 'job_level'
ORDER BY sort_order ASC, id ASC;
