SET NAMES utf8mb4;

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_status', 'REVIEW_REJECTED', '被拒审', 25, 1, 'red', '商店审核未通过，需要处理后重新提交'
WHERE NOT EXISTS (
  SELECT 1
  FROM `config_dict_items`
  WHERE `type_key` = 'matrix_package_status'
    AND `item_code` = 'REVIEW_REJECTED'
);
