SET NAMES utf8mb4;

SET @has_confirmed_content := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matrix_package_side_notes' AND COLUMN_NAME = 'confirmed_content'
);
SET @sql := IF(@has_confirmed_content = 0, 'ALTER TABLE `matrix_package_side_notes` ADD COLUMN `confirmed_content` TEXT NULL AFTER `content`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_confirmed_by := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matrix_package_side_notes' AND COLUMN_NAME = 'confirmed_by'
);
SET @sql := IF(@has_confirmed_by = 0, 'ALTER TABLE `matrix_package_side_notes` ADD COLUMN `confirmed_by` BIGINT UNSIGNED NULL AFTER `confirmed_content`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_confirmed_at := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matrix_package_side_notes' AND COLUMN_NAME = 'confirmed_at'
);
SET @sql := IF(@has_confirmed_at = 0, 'ALTER TABLE `matrix_package_side_notes` ADD COLUMN `confirmed_at` TIMESTAMP NULL AFTER `confirmed_by`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
