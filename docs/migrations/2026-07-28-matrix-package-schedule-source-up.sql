SET NAMES utf8mb4;

ALTER TABLE `matrix_packages`
  MODIFY COLUMN `expected_cold_ready_date` DATETIME NULL;

SET @has_matrix_expected_source := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND COLUMN_NAME = 'expected_cold_ready_date_source'
);
SET @sql := IF(
  @has_matrix_expected_source = 0,
  'ALTER TABLE `matrix_packages` ADD COLUMN `expected_cold_ready_date_source` VARCHAR(20) NULL AFTER `expected_cold_ready_date`',
  'SELECT ''[skip] matrix_packages.expected_cold_ready_date_source already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_side_deadline := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND COLUMN_NAME = 'side_check_deadline_at'
);
SET @sql := IF(
  @has_side_deadline = 0,
  'ALTER TABLE `matrix_packages` ADD COLUMN `side_check_deadline_at` DATETIME NULL AFTER `expected_cold_ready_date_source`',
  'SELECT ''[skip] matrix_packages.side_check_deadline_at already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_side_deadline_source := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND COLUMN_NAME = 'side_check_deadline_source'
);
SET @sql := IF(
  @has_side_deadline_source = 0,
  'ALTER TABLE `matrix_packages` ADD COLUMN `side_check_deadline_source` VARCHAR(20) NULL AFTER `side_check_deadline_at`',
  'SELECT ''[skip] matrix_packages.side_check_deadline_source already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_node_expected_source := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_package_production_nodes'
    AND COLUMN_NAME = 'expected_delivery_date_source'
);
SET @sql := IF(
  @has_node_expected_source = 0,
  'ALTER TABLE `matrix_package_production_nodes` ADD COLUMN `expected_delivery_date_source` VARCHAR(20) NULL AFTER `expected_delivery_date`',
  'SELECT ''[skip] matrix_package_production_nodes.expected_delivery_date_source already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_demand_expected_source := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'expected_release_date_source'
);
SET @sql := IF(
  @has_demand_expected_source = 0,
  'ALTER TABLE `work_demands` ADD COLUMN `expected_release_date_source` VARCHAR(20) NULL AFTER `expected_release_date`',
  'SELECT ''[skip] work_demands.expected_release_date_source already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE matrix_packages
SET expected_cold_ready_date_source = 'AUTO_T'
WHERE expected_cold_ready_date IS NOT NULL
  AND expected_cold_ready_date_source IS NULL;

UPDATE matrix_packages
SET side_check_deadline_at = DATE_SUB(CAST(expected_cold_ready_date AS DATETIME), INTERVAL 1 DAY),
    side_check_deadline_source = 'AUTO_T'
WHERE expected_cold_ready_date IS NOT NULL
  AND side_check_deadline_at IS NULL;
