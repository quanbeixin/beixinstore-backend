-- Bug issue_stage support (VERIFY)
-- Generated: 2026-03-29

SET NAMES utf8mb4;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bugs'
  AND COLUMN_NAME = 'issue_stage';

SELECT
  INDEX_NAME,
  COLUMN_NAME
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bugs'
  AND INDEX_NAME = 'idx_issue_stage';

SELECT
  type_key,
  type_name,
  enabled
FROM config_dict_types
WHERE type_key = 'bug_stage';

SELECT
  type_key,
  item_code,
  item_name,
  sort_order,
  enabled
FROM config_dict_items
WHERE type_key = 'bug_stage'
ORDER BY sort_order ASC, id ASC;
