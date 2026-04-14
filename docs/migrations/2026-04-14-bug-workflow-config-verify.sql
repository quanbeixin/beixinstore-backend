SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_workflow_transitions';

SELECT COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'bug_workflow_transitions'
  AND COLUMN_NAME IN (
    'from_status_code',
    'to_status_code',
    'action_key',
    'action_name',
    'enabled',
    'require_remark',
    'require_fix_solution',
    'require_verify_result'
  );

SELECT COUNT(*) AS workflow_transition_rows
FROM bug_workflow_transitions
WHERE deleted_at IS NULL;
