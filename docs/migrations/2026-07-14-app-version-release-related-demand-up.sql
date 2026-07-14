SET NAMES utf8mb4;

SET @has_related_demand_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND column_name = 'related_demand_id'
);

SET @sql := IF(
  @has_related_demand_id = 0,
  'ALTER TABLE app_version_releases ADD COLUMN related_demand_id VARCHAR(64) NULL COMMENT ''关联需求ID'' AFTER domain_info',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_related_demand_name := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND column_name = 'related_demand_name'
);

SET @sql := IF(
  @has_related_demand_name = 0,
  'ALTER TABLE app_version_releases ADD COLUMN related_demand_name VARCHAR(255) NULL COMMENT ''关联需求名称'' AFTER related_demand_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_related_demand_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND index_name = 'idx_app_version_release_related_demand'
);

SET @sql := IF(
  @has_related_demand_index = 0,
  'ALTER TABLE app_version_releases ADD KEY idx_app_version_release_related_demand (related_demand_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
