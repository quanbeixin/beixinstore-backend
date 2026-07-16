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

CALL sp_add_column_if_missing('matrix_packages', 'linked_demand_id', "VARCHAR(64) NULL COMMENT '关联项目管理需求ID' AFTER `production_checklist`");
CALL sp_add_index_if_missing('matrix_packages', 'idx_matrix_packages_linked_demand', '`linked_demand_id`');

SET @matrix_package_production_template = '{"schema_version":2,"entry_node_key":"START","nodes":[{"node_key":"START","node_name":"开始","node_type":"MILESTONE","phase_key":"requirement","sort_order":10,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false},{"node_key":"MATRIX_PRODUCTION","node_name":"生产阶段","node_type":"EXECUTE","phase_key":"develop","sort_order":20,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false},{"node_key":"TEST_ACCEPTANCE","node_name":"测试验收","node_type":"QA","phase_key":"test","sort_order":30,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false},{"node_key":"DELIVERY_REVIEW","node_name":"交付提审","node_type":"RELEASE","phase_key":"release","sort_order":40,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false}],"edges":[{"from":"START","to":"MATRIX_PRODUCTION"},{"from":"MATRIX_PRODUCTION","to":"TEST_ACCEPTANCE"},{"from":"TEST_ACCEPTANCE","to":"DELIVERY_REVIEW"}]}';

INSERT INTO `project_templates` (`name`, `description`, `node_config`, `status`)
SELECT
  '矩阵包生产流程',
  '矩阵包生产流水线自动建需求使用的轻量流程：开始 -> 生产阶段 -> 测试验收 -> 交付提审。',
  CAST(@matrix_package_production_template AS JSON),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM `project_templates` WHERE `name` = '矩阵包生产流程'
);

UPDATE `project_templates`
SET
  `description` = '矩阵包生产流水线自动建需求使用的轻量流程：开始 -> 生产阶段 -> 测试验收 -> 交付提审。',
  `node_config` = CAST(@matrix_package_production_template AS JSON),
  `status` = 1
WHERE `name` = '矩阵包生产流程';

SELECT
  `id`,
  `name`,
  `status`,
  JSON_UNQUOTE(JSON_EXTRACT(`node_config`, '$.entry_node_key')) AS `entry_node_key`,
  JSON_LENGTH(`node_config`, '$.nodes') AS `node_count`
FROM `project_templates`
WHERE `name` = '矩阵包生产流程';
