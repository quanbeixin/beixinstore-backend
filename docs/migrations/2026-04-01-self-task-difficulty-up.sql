-- Personal task difficulty support for self workbench quick reporting (UP)
-- 1) Add work_logs.self_task_difficulty_code
-- 2) Reuse existing dict type task_difficulty

SET @has_self_task_difficulty_col = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_logs'
    AND COLUMN_NAME = 'self_task_difficulty_code'
);

SET @alter_self_task_difficulty_sql = IF(
  @has_self_task_difficulty_col = 0,
  'ALTER TABLE `work_logs` ADD COLUMN `self_task_difficulty_code` VARCHAR(32) NULL COMMENT ''个人预估任务难度字典编码，仅个人填报维护使用'' AFTER `personal_estimate_hours`',
  'SELECT ''[skip] work_logs.self_task_difficulty_code already exists'' AS message'
);
PREPARE stmt_add_self_task_difficulty_col FROM @alter_self_task_difficulty_sql;
EXECUTE stmt_add_self_task_difficulty_col;
DEALLOCATE PREPARE stmt_add_self_task_difficulty_col;

SET @has_self_task_difficulty_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_logs'
    AND INDEX_NAME = 'idx_self_task_difficulty_code'
);

SET @alter_self_task_difficulty_idx_sql = IF(
  @has_self_task_difficulty_idx = 0,
  'ALTER TABLE `work_logs` ADD KEY `idx_self_task_difficulty_code` (`self_task_difficulty_code`)',
  'SELECT ''[skip] idx_self_task_difficulty_code already exists'' AS message'
);
PREPARE stmt_add_self_task_difficulty_idx FROM @alter_self_task_difficulty_idx_sql;
EXECUTE stmt_add_self_task_difficulty_idx;
DEALLOCATE PREPARE stmt_add_self_task_difficulty_idx;
