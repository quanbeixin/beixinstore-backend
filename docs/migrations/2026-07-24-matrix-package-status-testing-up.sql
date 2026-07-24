SET NAMES utf8mb4;

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_status', 'TESTING', '测试中', 12, 1, 'purple', '生产完成后进入测试验收阶段'
WHERE NOT EXISTS (
  SELECT 1
  FROM `config_dict_items`
  WHERE `type_key` = 'matrix_package_status'
    AND `item_code` = 'TESTING'
);
