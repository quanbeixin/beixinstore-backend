-- Project Management V1 (DOWN / rollback)
-- Warning: this script drops columns/tables introduced by V1 migration.

SET NAMES utf8mb4;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_drop_column_if_exists $$
CREATE PROCEDURE sp_drop_column_if_exists(
  IN p_table VARCHAR(128),
  IN p_column VARCHAR(128)
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = p_table
        AND COLUMN_NAME = p_column
    ) THEN
      SET @sql = CONCAT('ALTER TABLE `', p_table, '` DROP COLUMN `', p_column, '`');
      PREPARE stmt FROM @sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;
  END IF;
END $$

DROP PROCEDURE IF EXISTS sp_drop_index_if_exists $$
CREATE PROCEDURE sp_drop_index_if_exists(
  IN p_table VARCHAR(128),
  IN p_index VARCHAR(128)
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = p_table
        AND INDEX_NAME = p_index
    ) THEN
      SET @sql = CONCAT('ALTER TABLE `', p_table, '` DROP INDEX `', p_index, '`');
      PREPARE stmt FROM @sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;
  END IF;
END $$

DELIMITER ;

-- Drop indexes first
CALL sp_drop_index_if_exists('work_demands', 'idx_template_id');
CALL sp_drop_index_if_exists('work_demands', 'idx_project_manager');
CALL sp_drop_index_if_exists('work_demands', 'idx_health_status');

CALL sp_drop_index_if_exists('wf_process_tasks', 'idx_deadline');
CALL sp_drop_index_if_exists('work_logs', 'idx_relate_task_id');

-- Drop columns from work_demands
CALL sp_drop_column_if_exists('work_demands', 'management_mode');
CALL sp_drop_column_if_exists('work_demands', 'template_id');
CALL sp_drop_column_if_exists('work_demands', 'project_manager');
CALL sp_drop_column_if_exists('work_demands', 'health_status');
CALL sp_drop_column_if_exists('work_demands', 'actual_start_time');
CALL sp_drop_column_if_exists('work_demands', 'actual_end_time');
CALL sp_drop_column_if_exists('work_demands', 'doc_link');

-- Drop columns from wf_process_instance_nodes
CALL sp_drop_column_if_exists('wf_process_instance_nodes', 'owner_estimated_hours');
CALL sp_drop_column_if_exists('wf_process_instance_nodes', 'personal_estimated_hours');
CALL sp_drop_column_if_exists('wf_process_instance_nodes', 'actual_hours');
CALL sp_drop_column_if_exists('wf_process_instance_nodes', 'planned_start_time');
CALL sp_drop_column_if_exists('wf_process_instance_nodes', 'planned_end_time');
CALL sp_drop_column_if_exists('wf_process_instance_nodes', 'actual_start_time');
CALL sp_drop_column_if_exists('wf_process_instance_nodes', 'actual_end_time');
CALL sp_drop_column_if_exists('wf_process_instance_nodes', 'reject_reason');

-- Drop columns from wf_process_tasks
CALL sp_drop_column_if_exists('wf_process_tasks', 'personal_estimated_hours');
CALL sp_drop_column_if_exists('wf_process_tasks', 'actual_hours');
CALL sp_drop_column_if_exists('wf_process_tasks', 'deadline');

-- Drop columns from work_logs
CALL sp_drop_column_if_exists('work_logs', 'relate_task_id');

-- Drop tables created by migration
DROP TABLE IF EXISTS `notification_config`;
DROP TABLE IF EXISTS `node_status_logs`;
DROP TABLE IF EXISTS `project_members`;
DROP TABLE IF EXISTS `task_collaborators`;
DROP TABLE IF EXISTS `project_templates`;

-- cleanup helper procedures
DROP PROCEDURE IF EXISTS sp_drop_index_if_exists;
DROP PROCEDURE IF EXISTS sp_drop_column_if_exists;

