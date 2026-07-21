SET NAMES utf8mb4;

SET @has_delivery_status_code := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND COLUMN_NAME = 'delivery_status_code'
);

SET @sql := IF(
  @has_delivery_status_code = 0,
  'ALTER TABLE `matrix_packages` ADD COLUMN `delivery_status_code` VARCHAR(50) NULL AFTER `platform`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_delivery_status_index := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND INDEX_NAME = 'idx_matrix_packages_delivery_status'
);

SET @sql := IF(
  @has_delivery_status_index = 0,
  'ALTER TABLE `matrix_packages` ADD KEY `idx_matrix_packages_delivery_status` (`delivery_status_code`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'matrix_package_delivery_status', '矩阵包投放状态', '矩阵包基础信息中的投放状态枚举。', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'matrix_package_delivery_status'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_delivery_status', 'ACTIVE', '在投', 10, 1, 'green', '当前正在投放'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_delivery_status' AND `item_code` = 'ACTIVE'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_delivery_status', 'STOPPED', '停投', 20, 1, 'default', '当前已停止投放'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_delivery_status' AND `item_code` = 'STOPPED'
);
