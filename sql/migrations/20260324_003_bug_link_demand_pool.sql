SET @pm_bugs_demand_id_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pm_bugs'
    AND COLUMN_NAME = 'demand_id'
);

SET @pm_bugs_demand_id_col_sql := IF(
  @pm_bugs_demand_id_col_exists = 0,
  'ALTER TABLE pm_bugs ADD COLUMN demand_id VARCHAR(20) DEFAULT NULL AFTER requirement_id',
  'SELECT 1'
);
PREPARE pm_bugs_demand_id_col_stmt FROM @pm_bugs_demand_id_col_sql;
EXECUTE pm_bugs_demand_id_col_stmt;
DEALLOCATE PREPARE pm_bugs_demand_id_col_stmt;

SET @pm_bugs_demand_id_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pm_bugs'
    AND INDEX_NAME = 'idx_pm_bugs_demand_id'
);

SET @pm_bugs_demand_id_idx_sql := IF(
  @pm_bugs_demand_id_idx_exists = 0,
  'CREATE INDEX idx_pm_bugs_demand_id ON pm_bugs (demand_id)',
  'SELECT 1'
);
PREPARE pm_bugs_demand_id_idx_stmt FROM @pm_bugs_demand_id_idx_sql;
EXECUTE pm_bugs_demand_id_idx_stmt;
DEALLOCATE PREPARE pm_bugs_demand_id_idx_stmt;
