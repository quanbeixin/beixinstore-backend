-- Bug issue_stage support (UP)
-- Generated: 2026-03-29
-- Notes: idempotent migration for issue_stage column and bug_stage dictionary.

SET NAMES utf8mb4;

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bugs'
    AND COLUMN_NAME = 'issue_stage'
);

SET @sql_add_column := IF(
  @column_exists = 0,
  'ALTER TABLE `bugs` ADD COLUMN `issue_stage` VARCHAR(50) NULL COMMENT ''Bug阶段字典编码'' AFTER `product_code`',
  'SELECT ''[skip] bugs.issue_stage already exists'' AS message'
);
PREPARE stmt_add_column FROM @sql_add_column;
EXECUTE stmt_add_column;
DEALLOCATE PREPARE stmt_add_column;

SET @index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bugs'
    AND INDEX_NAME = 'idx_issue_stage'
);

SET @sql_add_index := IF(
  @index_exists = 0,
  'ALTER TABLE `bugs` ADD KEY `idx_issue_stage` (`issue_stage`)',
  'SELECT ''[skip] idx_issue_stage already exists'' AS message'
);
PREPARE stmt_add_index FROM @sql_add_index;
EXECUTE stmt_add_index;
DEALLOCATE PREPARE stmt_add_index;

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'bug_stage', 'Bug阶段', 'Bug阶段字典', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'bug_stage'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_stage', 'ANALYSIS', '需求分析', 10, 1, 'blue', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_stage' AND `item_code` = 'ANALYSIS'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_stage', 'DESIGN', '方案设计', 20, 1, 'cyan', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_stage' AND `item_code` = 'DESIGN'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_stage', 'DEVELOPMENT', '开发实现', 30, 1, 'gold', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_stage' AND `item_code` = 'DEVELOPMENT'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_stage', 'TESTING', '测试验证', 40, 1, 'purple', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_stage' AND `item_code` = 'TESTING'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_stage', 'RELEASE', '上线发布', 50, 1, 'green', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_stage' AND `item_code` = 'RELEASE'
);
