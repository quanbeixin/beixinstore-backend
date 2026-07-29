SET @has_column := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND COLUMN_NAME = 'has_operated'
);

SET @sql := IF(
  @has_column = 0,
  'ALTER TABLE `matrix_packages` ADD COLUMN `has_operated` TINYINT(1) NOT NULL DEFAULT 0 AFTER `delivery_status_code`',
  'SELECT ''[skip] matrix_packages.has_operated already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE matrix_packages
SET has_operated = 1
WHERE deleted_at IS NULL
  AND status_code = 'DELIVERING'
  AND has_operated = 0;
