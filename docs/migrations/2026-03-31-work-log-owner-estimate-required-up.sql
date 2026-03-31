-- Add node-level owner estimate required snapshot to work logs (UP)

SET NAMES utf8mb4;

SET @db_name = DATABASE();

SET @has_owner_required_col = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'work_logs'
    AND COLUMN_NAME = 'owner_estimate_required'
);

SET @alter_add_owner_required_col_sql = IF(
  @has_owner_required_col = 0,
  'ALTER TABLE `work_logs` ADD COLUMN `owner_estimate_required` TINYINT(1) NULL COMMENT ''是否需要 Owner 评估快照：1需要，0不需要，NULL按历史口径回退'' AFTER `owner_estimate_hours`',
  'SELECT ''[skip] work_logs.owner_estimate_required already exists'' AS message'
);
PREPARE stmt_add_owner_required_col FROM @alter_add_owner_required_col_sql;
EXECUTE stmt_add_owner_required_col;
DEALLOCATE PREPARE stmt_add_owner_required_col;

SET @has_owner_required_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'work_logs'
    AND INDEX_NAME = 'idx_owner_estimate_required'
);

SET @alter_add_owner_required_idx_sql = IF(
  @has_owner_required_idx = 0,
  'ALTER TABLE `work_logs` ADD KEY `idx_owner_estimate_required` (`owner_estimate_required`)',
  'SELECT ''[skip] idx_owner_estimate_required already exists'' AS message'
);
PREPARE stmt_add_owner_required_idx FROM @alter_add_owner_required_idx_sql;
EXECUTE stmt_add_owner_required_idx;
DEALLOCATE PREPARE stmt_add_owner_required_idx;
