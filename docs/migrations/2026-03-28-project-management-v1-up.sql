-- Project Management V1 (UP)
-- Generated: 2026-03-28
-- Notes:
-- 1) Idempotent for existing columns/indexes/tables.
-- 2) wf_process_* table alterations are skipped automatically when tables are absent.

SET NAMES utf8mb4;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_add_column_if_missing $$
CREATE PROCEDURE sp_add_column_if_missing(
  IN p_table VARCHAR(128),
  IN p_column VARCHAR(128),
  IN p_definition TEXT
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = p_table
        AND COLUMN_NAME = p_column
    ) THEN
      SET @sql = CONCAT(
        'ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ',
        p_definition
      );
      PREPARE stmt FROM @sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;
  END IF;
END $$

DROP PROCEDURE IF EXISTS sp_add_index_if_missing $$
CREATE PROCEDURE sp_add_index_if_missing(
  IN p_table VARCHAR(128),
  IN p_index VARCHAR(128),
  IN p_columns_expr TEXT
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = p_table
        AND INDEX_NAME = p_index
    ) THEN
      SET @sql = CONCAT(
        'ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (',
        p_columns_expr, ')'
      );
      PREPARE stmt FROM @sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;
  END IF;
END $$

DELIMITER ;

-- 1) Extend work_demands
CALL sp_add_column_if_missing('work_demands', 'management_mode', "VARCHAR(20) NOT NULL DEFAULT 'simple' COMMENT 'simple/advanced'");
CALL sp_add_column_if_missing('work_demands', 'template_id', "INT NULL COMMENT '关联模板ID'");
CALL sp_add_column_if_missing('work_demands', 'project_manager', "BIGINT NULL COMMENT '项目负责人'");
CALL sp_add_column_if_missing('work_demands', 'health_status', "VARCHAR(10) NOT NULL DEFAULT 'green' COMMENT '健康度 red/yellow/green'");
CALL sp_add_column_if_missing('work_demands', 'actual_start_time', "DATETIME NULL COMMENT '实际开始时间'");
CALL sp_add_column_if_missing('work_demands', 'actual_end_time', "DATETIME NULL COMMENT '实际结束时间'");
CALL sp_add_column_if_missing('work_demands', 'doc_link', "VARCHAR(500) NULL COMMENT 'PRD文档链接'");

CALL sp_add_index_if_missing('work_demands', 'idx_template_id', '`template_id`');
CALL sp_add_index_if_missing('work_demands', 'idx_project_manager', '`project_manager`');
CALL sp_add_index_if_missing('work_demands', 'idx_health_status', '`health_status`');

-- 2) Create project_templates
CREATE TABLE IF NOT EXISTS `project_templates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT '模板名称',
  `description` TEXT NULL COMMENT '模板描述',
  `node_config` JSON NOT NULL COMMENT '节点流程配置',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目模板表';

-- 3) Extend wf_process_instance_nodes (skip when table absent)
CALL sp_add_column_if_missing('wf_process_instance_nodes', 'owner_estimated_hours', "DECIMAL(10,2) NULL COMMENT 'Owner预估工时'");
CALL sp_add_column_if_missing('wf_process_instance_nodes', 'personal_estimated_hours', "DECIMAL(10,2) NULL COMMENT '个人预估工时汇总'");
CALL sp_add_column_if_missing('wf_process_instance_nodes', 'actual_hours', "DECIMAL(10,2) NULL COMMENT '实际工时汇总'");
CALL sp_add_column_if_missing('wf_process_instance_nodes', 'planned_start_time', "DATETIME NULL COMMENT '预期开始时间'");
CALL sp_add_column_if_missing('wf_process_instance_nodes', 'planned_end_time', "DATETIME NULL COMMENT '预期结束时间'");
CALL sp_add_column_if_missing('wf_process_instance_nodes', 'actual_start_time', "DATETIME NULL COMMENT '实际开始时间'");
CALL sp_add_column_if_missing('wf_process_instance_nodes', 'actual_end_time', "DATETIME NULL COMMENT '实际结束时间'");
CALL sp_add_column_if_missing('wf_process_instance_nodes', 'reject_reason', "TEXT NULL COMMENT '驳回原因'");

-- 4) Extend wf_process_tasks (skip when table absent)
CALL sp_add_column_if_missing('wf_process_tasks', 'personal_estimated_hours', "DECIMAL(10,2) NULL COMMENT '个人预估工时'");
CALL sp_add_column_if_missing('wf_process_tasks', 'actual_hours', "DECIMAL(10,2) NULL COMMENT '实际工时'");
CALL sp_add_column_if_missing('wf_process_tasks', 'deadline', "DATETIME NULL COMMENT '截止时间'");
CALL sp_add_index_if_missing('wf_process_tasks', 'idx_deadline', '`deadline`');

-- 5) task_collaborators
CREATE TABLE IF NOT EXISTS `task_collaborators` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT NOT NULL COMMENT '关联任务ID',
  `user_id` BIGINT NOT NULL COMMENT '协作人ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_user` (`task_id`, `user_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务协作人表';

-- 6) Extend work_logs
CALL sp_add_column_if_missing('work_logs', 'relate_task_id', "BIGINT NULL COMMENT '关联任务ID'");
CALL sp_add_index_if_missing('work_logs', 'idx_relate_task_id', '`relate_task_id`');

-- 7) project_members (demand_id must align with work_demands.id style: REQxxx)
CREATE TABLE IF NOT EXISTS `project_members` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `demand_id` VARCHAR(64) NOT NULL COMMENT '关联项目ID(work_demands.id)',
  `user_id` BIGINT NOT NULL COMMENT '用户ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_demand_user` (`demand_id`, `user_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目成员表';

-- 8) node_status_logs
CREATE TABLE IF NOT EXISTS `node_status_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `node_id` BIGINT NOT NULL COMMENT '关联节点ID',
  `from_status` VARCHAR(20) NULL COMMENT '变更前状态',
  `to_status` VARCHAR(20) NOT NULL COMMENT '变更后状态',
  `operator_id` BIGINT NOT NULL COMMENT '操作人',
  `operation_type` VARCHAR(20) NULL COMMENT '操作类型',
  `remark` TEXT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_node_id` (`node_id`),
  KEY `idx_operator_id` (`operator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点状态变更日志表';

-- 9) notification_config
CREATE TABLE IF NOT EXISTS `notification_config` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `scene` VARCHAR(50) NOT NULL COMMENT '通知场景',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  `receiver_roles` JSON NULL COMMENT '接收角色列表',
  `advance_days` INT NOT NULL DEFAULT 1 COMMENT '提前天数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_scene` (`scene`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知配置表';

INSERT INTO `notification_config` (`scene`, `enabled`, `receiver_roles`, `advance_days`)
VALUES
  ('node_assign', 1, JSON_ARRAY('node_assignee'), 0),
  ('node_reject', 1, JSON_ARRAY('node_assignee'), 0),
  ('task_assign', 1, JSON_ARRAY('task_assignee'), 0),
  ('task_deadline', 1, JSON_ARRAY('task_assignee'), 1),
  ('task_complete', 1, JSON_ARRAY('task_creator'), 0),
  ('node_complete', 1, JSON_ARRAY('project_manager'), 0)
ON DUPLICATE KEY UPDATE
  `enabled` = VALUES(`enabled`),
  `receiver_roles` = VALUES(`receiver_roles`),
  `advance_days` = VALUES(`advance_days`),
  `updated_at` = CURRENT_TIMESTAMP;

-- cleanup helper procedures
DROP PROCEDURE IF EXISTS sp_add_index_if_missing;
DROP PROCEDURE IF EXISTS sp_add_column_if_missing;

