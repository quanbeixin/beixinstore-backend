SET NAMES utf8mb4;

SET @has_domain_info := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND COLUMN_NAME = 'domain_info'
);

SET @sql := IF(
  @has_domain_info = 0,
  'ALTER TABLE `matrix_packages` ADD COLUMN `domain_info` VARCHAR(255) NULL AFTER `new_package_version`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
