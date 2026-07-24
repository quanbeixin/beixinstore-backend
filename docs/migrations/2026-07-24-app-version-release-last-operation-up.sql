SET NAMES utf8mb4;

SET @has_last_operation_summary := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND column_name = 'last_operation_summary'
);

SET @sql := IF(
  @has_last_operation_summary = 0,
  'ALTER TABLE app_version_releases ADD COLUMN last_operation_summary VARCHAR(1000) NULL COMMENT ''最近操作记录'' AFTER remark',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_last_operation_user_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND column_name = 'last_operation_user_id'
);

SET @sql := IF(
  @has_last_operation_user_id = 0,
  'ALTER TABLE app_version_releases ADD COLUMN last_operation_user_id BIGINT UNSIGNED NULL COMMENT ''最近操作人用户ID'' AFTER last_operation_summary',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_last_operation_user_name := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND column_name = 'last_operation_user_name'
);

SET @sql := IF(
  @has_last_operation_user_name = 0,
  'ALTER TABLE app_version_releases ADD COLUMN last_operation_user_name VARCHAR(80) NULL COMMENT ''最近操作人名称'' AFTER last_operation_user_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_last_operation_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND column_name = 'last_operation_at'
);

SET @sql := IF(
  @has_last_operation_at = 0,
  'ALTER TABLE app_version_releases ADD COLUMN last_operation_at DATETIME NULL COMMENT ''最近操作时间'' AFTER last_operation_user_name',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE app_version_releases avr
LEFT JOIN users operatorUser
  ON operatorUser.id = avr.updated_by
SET avr.last_operation_summary = COALESCE(NULLIF(avr.last_operation_summary, ''), '历史最近操作（字段差异未记录）'),
    avr.last_operation_user_id = COALESCE(avr.last_operation_user_id, avr.updated_by),
    avr.last_operation_user_name = COALESCE(NULLIF(avr.last_operation_user_name, ''), NULLIF(operatorUser.real_name, ''), operatorUser.username),
    avr.last_operation_at = COALESCE(avr.last_operation_at, avr.updated_at),
    avr.updated_at = avr.updated_at
WHERE avr.last_operation_at IS NULL
   OR COALESCE(avr.last_operation_summary, '') = '';
