SET NAMES utf8mb4;

SET @has_previous_release_info := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND column_name = 'previous_release_info'
);

SET @sql := IF(
  @has_previous_release_info = 0,
  'ALTER TABLE app_version_releases ADD COLUMN previous_release_info VARCHAR(255) NULL COMMENT ''前序发版'' AFTER app_console_url',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
