SET NAMES utf8mb4;

SET @has_new_package_version := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND COLUMN_NAME = 'new_package_version'
);

SET @sql := IF(
  @has_new_package_version = 0,
  'ALTER TABLE `matrix_packages` ADD COLUMN `new_package_version` VARCHAR(50) NULL AFTER `package_name`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
