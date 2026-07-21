SET NAMES utf8mb4;

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'matrix_package_delivery_platform', '矩阵包投放平台', '矩阵包基础信息中的投放平台枚举，支持多选。', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'matrix_package_delivery_platform'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_delivery_platform', 'META', 'Meta', 10, 1, 'blue', 'Meta 投放平台'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_delivery_platform' AND `item_code` = 'META'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_delivery_platform', 'GOOGLE', 'Google', 20, 1, 'green', 'Google 投放平台'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_delivery_platform' AND `item_code` = 'GOOGLE'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_delivery_platform', 'SNAPCHAT', 'Snapchat', 30, 1, 'gold', 'Snapchat 投放平台'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_delivery_platform' AND `item_code` = 'SNAPCHAT'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_delivery_platform', 'TT', 'TT', 40, 1, 'purple', 'TT 投放平台'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_delivery_platform' AND `item_code` = 'TT'
);
