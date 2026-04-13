SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_assignees';

SELECT COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_assignees'
  AND COLUMN_NAME IN ('bug_id', 'user_id', 'is_primary');

SELECT
  COUNT(*) AS relation_rows,
  COUNT(DISTINCT bug_id) AS related_bug_count
FROM bug_assignees;

SELECT
  COUNT(*) AS missing_primary_relation_count
FROM bugs b
LEFT JOIN bug_assignees ba
  ON ba.bug_id = b.id
 AND ba.user_id = b.assignee_id
WHERE b.deleted_at IS NULL
  AND b.assignee_id IS NOT NULL
  AND ba.id IS NULL;
