SET NAMES utf8mb4;

SET @expected_delivery_column_type := (
  SELECT DATA_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_package_production_nodes'
    AND COLUMN_NAME = 'expected_delivery_date'
  LIMIT 1
);

SET @sql := IF(
  @expected_delivery_column_type IS NULL,
  'SELECT 1',
  IF(
    UPPER(@expected_delivery_column_type) = 'DATE',
    'ALTER TABLE `matrix_package_production_nodes` MODIFY COLUMN `expected_delivery_date` DATETIME NULL AFTER `owner_name`',
    'SELECT 1'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
