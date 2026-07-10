SET NAMES utf8mb4;

SET @has_owner_user_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_package_side_notes'
    AND COLUMN_NAME = 'owner_user_id'
);
SET @sql := IF(
  @has_owner_user_id = 0,
  'ALTER TABLE `matrix_package_side_notes` ADD COLUMN `owner_user_id` BIGINT UNSIGNED NULL AFTER `confirmed_at`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_owner_name := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_package_side_notes'
    AND COLUMN_NAME = 'owner_name'
);
SET @sql := IF(
  @has_owner_name = 0,
  'ALTER TABLE `matrix_package_side_notes` ADD COLUMN `owner_name` VARCHAR(80) NULL AFTER `owner_user_id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
