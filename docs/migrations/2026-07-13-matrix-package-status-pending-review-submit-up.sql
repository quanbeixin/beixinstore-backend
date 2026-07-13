SET NAMES utf8mb4;

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_status', 'PENDING_REVIEW_SUBMIT', '待送审', 15, 1, 'orange', '冷备包已准备好，等待提交商店审核'
WHERE NOT EXISTS (
  SELECT 1
  FROM `config_dict_items`
  WHERE `type_key` = 'matrix_package_status'
    AND `item_code` = 'PENDING_REVIEW_SUBMIT'
);
