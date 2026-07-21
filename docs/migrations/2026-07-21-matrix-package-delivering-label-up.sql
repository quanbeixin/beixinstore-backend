SET NAMES utf8mb4;

UPDATE `config_dict_items`
SET `item_name` = '运营中',
    `remark` = '当前正在消耗预算进行运营'
WHERE `type_key` = 'matrix_package_status'
  AND `item_code` = 'DELIVERING';

UPDATE `config_dict_types`
SET `description` = '仅对运营中矩阵包生效，第一版手动维护，后续可按数据规则自动判断。'
WHERE `type_key` = 'matrix_package_health';
