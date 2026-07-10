SET NAMES utf8mb4;

SET @has_app_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND COLUMN_NAME = 'app_id'
);

SET @sql := IF(
  @has_app_id = 0,
  'ALTER TABLE `matrix_packages` ADD COLUMN `app_id` VARCHAR(80) NULL AFTER `package_name`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
