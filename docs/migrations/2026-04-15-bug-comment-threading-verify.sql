SELECT COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_status_logs'
  AND COLUMN_NAME IN ('parent_comment_id', 'edited_at');

SHOW INDEX FROM bug_status_logs
WHERE Key_name = 'idx_bug_status_logs_parent_comment_id';
