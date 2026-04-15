SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_comment_attachments';

SELECT COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_comment_attachments'
  AND COLUMN_NAME IN (
    'bug_id',
    'comment_log_id',
    'file_name',
    'object_key',
    'uploaded_by'
  );

SELECT COUNT(*) AS bug_comment_attachment_rows
FROM bug_comment_attachments;
