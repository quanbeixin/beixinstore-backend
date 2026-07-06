SET NAMES utf8mb4;

SET @has_production_stage_code := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matrix_packages' AND COLUMN_NAME = 'production_stage_code'
);
SET @sql := IF(@has_production_stage_code = 0, 'ALTER TABLE `matrix_packages` ADD COLUMN `production_stage_code` VARCHAR(50) NULL AFTER `health_code`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_expected_cold_ready_date := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matrix_packages' AND COLUMN_NAME = 'expected_cold_ready_date'
);
SET @sql := IF(@has_expected_cold_ready_date = 0, 'ALTER TABLE `matrix_packages` ADD COLUMN `expected_cold_ready_date` DATE NULL AFTER `production_stage_code`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_latest_progress := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matrix_packages' AND COLUMN_NAME = 'latest_progress'
);
SET @sql := IF(@has_latest_progress = 0, 'ALTER TABLE `matrix_packages` ADD COLUMN `latest_progress` VARCHAR(500) NULL AFTER `expected_cold_ready_date`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_production_checklist := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matrix_packages' AND COLUMN_NAME = 'production_checklist'
);
SET @sql := IF(@has_production_checklist = 0, 'ALTER TABLE `matrix_packages` ADD COLUMN `production_checklist` JSON NULL AFTER `latest_progress`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_production_stage_index := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matrix_packages' AND INDEX_NAME = 'idx_matrix_packages_production_stage'
);
SET @sql := IF(@has_production_stage_index = 0, 'ALTER TABLE `matrix_packages` ADD KEY `idx_matrix_packages_production_stage` (`production_stage_code`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_expected_cold_ready_index := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matrix_packages' AND INDEX_NAME = 'idx_matrix_packages_expected_cold_ready'
);
SET @sql := IF(@has_expected_cold_ready_index = 0, 'ALTER TABLE `matrix_packages` ADD KEY `idx_matrix_packages_expected_cold_ready` (`expected_cold_ready_date`)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'matrix_package_production_stage', '矩阵包生产节点', '冷备包生产线使用的推进节点枚举。', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'matrix_package_production_stage');

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'REQUIREMENT_CONFIRM', '需求确认', 10, 1, 'default', '确认包生产目标与基本信息'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'REQUIREMENT_CONFIRM'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'ASSET_PREPARE', '素材准备', 20, 1, 'blue', '准备生产所需素材与配置资料'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'ASSET_PREPARE'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'DEVELOPING', '开发中', 30, 1, 'cyan', '开发实现中'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'DEVELOPING'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'PACKAGING', '打包中', 40, 1, 'geekblue', '构建与打包中'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'PACKAGING'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'SELF_TEST', '自测中', 50, 1, 'gold', '生产完成后的内部验证'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'SELF_TEST'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'READY_FOR_COLD_STANDBY', '待转冷备', 60, 1, 'green', '生产完成，等待标记为冷备包'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'READY_FOR_COLD_STANDBY'
);
