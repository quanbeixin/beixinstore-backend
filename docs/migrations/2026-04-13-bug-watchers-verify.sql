SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_watchers';

SELECT COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_watchers'
  AND COLUMN_NAME IN ('bug_id', 'user_id');

SELECT COUNT(*) AS watcher_relation_rows
FROM bug_watchers;
