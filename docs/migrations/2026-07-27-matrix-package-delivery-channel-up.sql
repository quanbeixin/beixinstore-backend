SET NAMES utf8mb4;

SET @has_delivery_channel_code := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND COLUMN_NAME = 'delivery_channel_code'
);
SET @add_delivery_channel_code_sql := IF(
  @has_delivery_channel_code = 0,
  'ALTER TABLE `matrix_packages` ADD COLUMN `delivery_channel_code` VARCHAR(50) NULL AFTER `platform`',
  'SELECT ''[skip] matrix_packages.delivery_channel_code already exists'' AS message'
);
PREPARE stmt FROM @add_delivery_channel_code_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_delivery_channel_index := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND INDEX_NAME = 'idx_matrix_packages_delivery_channel'
);
SET @add_delivery_channel_index_sql := IF(
  @has_delivery_channel_index = 0,
  'ALTER TABLE `matrix_packages` ADD KEY `idx_matrix_packages_delivery_channel` (`delivery_channel_code`)',
  'SELECT ''[skip] idx_matrix_packages_delivery_channel already exists'' AS message'
);
PREPARE stmt FROM @add_delivery_channel_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'matrix_package_delivery_channel', '矩阵包投放渠道', '矩阵包基础信息中的投放渠道枚举。', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'matrix_package_delivery_channel'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_delivery_channel', 'SELF', '自投', 10, 1, 'green', '自投渠道'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_delivery_channel' AND `item_code` = 'SELF'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_delivery_channel', 'AGENCY', '代理', 20, 1, 'blue', '代理渠道'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_delivery_channel' AND `item_code` = 'AGENCY'
);
