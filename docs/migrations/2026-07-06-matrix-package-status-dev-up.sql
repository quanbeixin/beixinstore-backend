SET NAMES utf8mb4;

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_status', 'PENDING_DEV', '待开发', 5, 1, 'default', '已规划，尚未进入开发'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_status' AND `item_code` = 'PENDING_DEV'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_status', 'IN_DEVELOPMENT', '开发中', 8, 1, 'cyan', '正在开发或打包准备中'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_status' AND `item_code` = 'IN_DEVELOPMENT'
);
