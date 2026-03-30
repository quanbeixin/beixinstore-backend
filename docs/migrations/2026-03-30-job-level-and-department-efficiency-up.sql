-- Job level dictionary + users.job_level column (UP)
-- Generated: 2026-03-30
-- Purpose:
-- 1) add users.job_level
-- 2) create dict type job_level
-- 3) seed T1-T6

SET NAMES utf8mb4;

SET @db_name = DATABASE();
SET @has_job_level_col = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'job_level'
);
SET @alter_users_sql = IF(
  @has_job_level_col = 0,
  'ALTER TABLE `users` ADD COLUMN `job_level` VARCHAR(32) NULL COMMENT ''职级编码'' AFTER `department_id`',
  'SELECT ''[skip] users.job_level already exists'' AS message'
);
PREPARE stmt_add_job_level FROM @alter_users_sql;
EXECUTE stmt_add_job_level;
DEALLOCATE PREPARE stmt_add_job_level;

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'job_level', '职级', '用户职级字典，用于人效分析与用户信息维护', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'job_level'
);

UPDATE `config_dict_types`
SET
  `type_name` = '职级',
  `description` = '用户职级字典，用于人效分析与用户信息维护',
  `enabled` = 1,
  `is_builtin` = 1
WHERE `type_key` = 'job_level';

UPDATE `config_dict_items`
SET `item_name` = 'T1', `sort_order` = 10, `enabled` = 1, `color` = 'default'
WHERE `type_key` = 'job_level' AND `item_code` = 'T1';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'job_level', 'T1', 'T1', 10, 1, 'default', '职级初始化项', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'job_level' AND `item_code` = 'T1'
);

UPDATE `config_dict_items`
SET `item_name` = 'T2', `sort_order` = 20, `enabled` = 1, `color` = 'blue'
WHERE `type_key` = 'job_level' AND `item_code` = 'T2';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'job_level', 'T2', 'T2', 20, 1, 'blue', '职级初始化项', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'job_level' AND `item_code` = 'T2'
);

UPDATE `config_dict_items`
SET `item_name` = 'T3', `sort_order` = 30, `enabled` = 1, `color` = 'cyan'
WHERE `type_key` = 'job_level' AND `item_code` = 'T3';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'job_level', 'T3', 'T3', 30, 1, 'cyan', '职级初始化项', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'job_level' AND `item_code` = 'T3'
);

UPDATE `config_dict_items`
SET `item_name` = 'T4', `sort_order` = 40, `enabled` = 1, `color` = 'gold'
WHERE `type_key` = 'job_level' AND `item_code` = 'T4';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'job_level', 'T4', 'T4', 40, 1, 'gold', '职级初始化项', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'job_level' AND `item_code` = 'T4'
);

UPDATE `config_dict_items`
SET `item_name` = 'T5', `sort_order` = 50, `enabled` = 1, `color` = 'orange'
WHERE `type_key` = 'job_level' AND `item_code` = 'T5';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'job_level', 'T5', 'T5', 50, 1, 'orange', '职级初始化项', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'job_level' AND `item_code` = 'T5'
);

UPDATE `config_dict_items`
SET `item_name` = 'T6', `sort_order` = 60, `enabled` = 1, `color` = 'red'
WHERE `type_key` = 'job_level' AND `item_code` = 'T6';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'job_level', 'T6', 'T6', 60, 1, 'red', '职级初始化项', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'job_level' AND `item_code` = 'T6'
);
