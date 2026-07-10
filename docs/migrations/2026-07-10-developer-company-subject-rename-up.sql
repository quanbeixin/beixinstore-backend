UPDATE `config_dict_items`
SET `item_name` = '即时香港',
    `remark` = '矩阵包专项开发者公司主体',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `type_key` = 'developer_company_subject'
  AND `item_code` = 'HK1_JISHI';

UPDATE `config_dict_items`
SET `item_name` = '图虫香港',
    `remark` = '矩阵包专项开发者公司主体',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `type_key` = 'developer_company_subject'
  AND `item_code` = 'HK1_HORIZON';

UPDATE `config_dict_items`
SET `item_name` = '新加坡',
    `remark` = '矩阵包专项开发者公司主体',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `type_key` = 'developer_company_subject'
  AND `item_code` = 'SG1_FUTURE';

UPDATE `config_dict_items`
SET `item_name` = '美国',
    `remark` = '矩阵包专项开发者公司主体',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `type_key` = 'developer_company_subject'
  AND `item_code` = 'SG1_AIGC';

UPDATE `developer_accounts`
SET `company_name` = '即时香港',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `deleted_at` IS NULL
  AND `company_name` = '即设香港 - HK1 - Jishi';

UPDATE `developer_accounts`
SET `company_name` = '图虫香港',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `deleted_at` IS NULL
  AND `company_name` = '即设香港 - HK1 - Horizon';

UPDATE `developer_accounts`
SET `company_name` = '新加坡',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `deleted_at` IS NULL
  AND `company_name` = '新加坡主体1 - SG1 - FUTURE';

UPDATE `developer_accounts`
SET `company_name` = '美国',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `deleted_at` IS NULL
  AND `company_name` = '新加坡主体1 - SG1 - AIGC';
