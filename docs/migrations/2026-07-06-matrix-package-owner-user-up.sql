SET NAMES utf8mb4;

SET @has_owner_user_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND COLUMN_NAME = 'owner_user_id'
);

SET @sql := IF(
  @has_owner_user_id = 0,
  'ALTER TABLE `matrix_packages` ADD COLUMN `owner_user_id` BIGINT UNSIGNED NULL AFTER `platform`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_owner_user_index := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND INDEX_NAME = 'idx_matrix_packages_owner_user'
);

SET @sql := IF(
  @has_owner_user_index = 0,
  'ALTER TABLE `matrix_packages` ADD KEY `idx_matrix_packages_owner_user` (`owner_user_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
