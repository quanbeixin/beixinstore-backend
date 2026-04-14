SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_saved_views';

SELECT COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_saved_views'
  AND COLUMN_NAME IN ('view_name', 'visibility', 'view_config', 'created_by', 'deleted_at');

SELECT COUNT(*) AS bug_saved_view_rows
FROM bug_saved_views;
