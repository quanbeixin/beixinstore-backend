-- Project Management V1 (VERIFY)
-- Run after UP / DOWN to check schema status.

SET NAMES utf8mb4;

SELECT 'TABLE_EXISTS' AS check_type, table_name
FROM information_schema.TABLES
WHERE table_schema = DATABASE()
  AND table_name IN (
    'project_templates',
    'task_collaborators',
    'project_members',
    'node_status_logs',
    'notification_config'
  )
ORDER BY table_name;

SELECT 'WORK_DEMANDS_COLUMNS' AS check_type, column_name
FROM information_schema.COLUMNS
WHERE table_schema = DATABASE()
  AND table_name = 'work_demands'
  AND column_name IN (
    'management_mode',
    'template_id',
    'project_manager',
    'health_status',
    'actual_start_time',
    'actual_end_time',
    'doc_link'
  )
ORDER BY column_name;

SELECT 'WF_INSTANCE_NODE_COLUMNS' AS check_type, column_name
FROM information_schema.COLUMNS
WHERE table_schema = DATABASE()
  AND table_name = 'wf_process_instance_nodes'
  AND column_name IN (
    'owner_estimated_hours',
    'personal_estimated_hours',
    'actual_hours',
    'planned_start_time',
    'planned_end_time',
    'actual_start_time',
    'actual_end_time',
    'reject_reason'
  )
ORDER BY column_name;

SELECT 'WF_TASK_COLUMNS' AS check_type, column_name
FROM information_schema.COLUMNS
WHERE table_schema = DATABASE()
  AND table_name = 'wf_process_tasks'
  AND column_name IN (
    'personal_estimated_hours',
    'actual_hours',
    'deadline'
  )
ORDER BY column_name;

SELECT 'WORK_LOG_COLUMNS' AS check_type, column_name
FROM information_schema.COLUMNS
WHERE table_schema = DATABASE()
  AND table_name = 'work_logs'
  AND column_name IN ('relate_task_id')
ORDER BY column_name;

SELECT 'INDEX_EXISTS' AS check_type, table_name, index_name
FROM information_schema.STATISTICS
WHERE table_schema = DATABASE()
  AND (
    (table_name = 'work_demands' AND index_name IN ('idx_template_id', 'idx_project_manager', 'idx_health_status')) OR
    (table_name = 'wf_process_tasks' AND index_name IN ('idx_deadline')) OR
    (table_name = 'work_logs' AND index_name IN ('idx_relate_task_id'))
  )
GROUP BY table_name, index_name
ORDER BY table_name, index_name;

SET @notification_sql = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.TABLES
      WHERE table_schema = DATABASE()
        AND table_name = 'notification_config'
    ),
    "SELECT 'NOTIFICATION_SCENES' AS check_type, scene, enabled, advance_days
     FROM notification_config
     WHERE scene IN ('node_assign', 'node_reject', 'task_assign', 'task_deadline', 'task_complete', 'node_complete')
     ORDER BY scene",
    "SELECT 'NOTIFICATION_SCENES' AS check_type, 'notification_config table not found' AS scene, NULL AS enabled, NULL AS advance_days"
  )
);
PREPARE stmt_notification_verify FROM @notification_sql;
EXECUTE stmt_notification_verify;
DEALLOCATE PREPARE stmt_notification_verify;
