SET @requires_app_release_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'requires_app_release'
);

SET @sql_add_requires_app_release := IF(
  @requires_app_release_exists = 0,
  'ALTER TABLE `work_demands` ADD COLUMN `requires_app_release` TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''是否需要 APP 发版'' AFTER `business_value_expectation`',
  'SELECT ''[skip] work_demands.requires_app_release already exists'' AS message'
);

PREPARE stmt_add_requires_app_release FROM @sql_add_requires_app_release;
EXECUTE stmt_add_requires_app_release;
DEALLOCATE PREPARE stmt_add_requires_app_release;
