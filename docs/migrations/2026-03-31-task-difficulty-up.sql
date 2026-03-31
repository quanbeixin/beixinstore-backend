-- Task difficulty support for owner estimate maintenance (UP)
-- 1) Add work_logs.task_difficulty_code
-- 2) Create dict type task_difficulty
-- 3) Seed N1~N4

SET NAMES utf8mb4;

SET @db_name = DATABASE();

SET @has_task_difficulty_col = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'work_logs'
    AND COLUMN_NAME = 'task_difficulty_code'
);
SET @alter_work_logs_sql = IF(
  @has_task_difficulty_col = 0,
  'ALTER TABLE `work_logs` ADD COLUMN `task_difficulty_code` VARCHAR(32) NULL COMMENT ''任务难度字典编码，仅 Owner 内部评估使用'' AFTER `owner_estimate_hours`',
  'SELECT ''[skip] work_logs.task_difficulty_code already exists'' AS message'
);
PREPARE stmt_add_task_difficulty_col FROM @alter_work_logs_sql;
EXECUTE stmt_add_task_difficulty_col;
DEALLOCATE PREPARE stmt_add_task_difficulty_col;

SET @has_task_difficulty_idx = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'work_logs'
    AND INDEX_NAME = 'idx_task_difficulty_code'
);
SET @alter_work_logs_idx_sql = IF(
  @has_task_difficulty_idx = 0,
  'ALTER TABLE `work_logs` ADD KEY `idx_task_difficulty_code` (`task_difficulty_code`)',
  'SELECT ''[skip] idx_task_difficulty_code already exists'' AS message'
);
PREPARE stmt_add_task_difficulty_idx FROM @alter_work_logs_idx_sql;
EXECUTE stmt_add_task_difficulty_idx;
DEALLOCATE PREPARE stmt_add_task_difficulty_idx;

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT
  'task_difficulty',
  '任务难度',
  'Owner 内部维护的任务难度分级，仅用于事项 Owner 评估维护',
  1,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'task_difficulty'
);

UPDATE `config_dict_types`
SET
  `type_name` = '任务难度',
  `description` = 'Owner 内部维护的任务难度分级，仅用于事项 Owner 评估维护',
  `enabled` = 1,
  `is_builtin` = 1
WHERE `type_key` = 'task_difficulty';

UPDATE `config_dict_items`
SET `item_name` = 'N1', `sort_order` = 10, `enabled` = 1, `remark` = '任务难度'
WHERE `type_key` = 'task_difficulty' AND `item_code` = 'N1';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'task_difficulty', 'N1', 'N1', 10, 1, 'green', '任务难度', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'task_difficulty' AND `item_code` = 'N1'
);

UPDATE `config_dict_items`
SET `item_name` = 'N2', `sort_order` = 20, `enabled` = 1, `remark` = '任务难度'
WHERE `type_key` = 'task_difficulty' AND `item_code` = 'N2';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'task_difficulty', 'N2', 'N2', 20, 1, 'blue', '任务难度', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'task_difficulty' AND `item_code` = 'N2'
);

UPDATE `config_dict_items`
SET `item_name` = 'N3', `sort_order` = 30, `enabled` = 1, `remark` = '任务难度'
WHERE `type_key` = 'task_difficulty' AND `item_code` = 'N3';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'task_difficulty', 'N3', 'N3', 30, 1, 'orange', '任务难度', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'task_difficulty' AND `item_code` = 'N3'
);

UPDATE `config_dict_items`
SET `item_name` = 'N4', `sort_order` = 40, `enabled` = 1, `remark` = '任务难度'
WHERE `type_key` = 'task_difficulty' AND `item_code` = 'N4';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'task_difficulty', 'N4', 'N4', 40, 1, 'red', '任务难度', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'task_difficulty' AND `item_code` = 'N4'
);
