SET @has_company_code := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'developer_accounts'
    AND COLUMN_NAME = 'company_code'
);

SET @ddl := IF(
  @has_company_code = 0,
  'ALTER TABLE `developer_accounts` ADD COLUMN `company_code` VARCHAR(64) NULL COMMENT ''公司主体字典编码'' AFTER `id`',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_company_code_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'developer_accounts'
    AND INDEX_NAME = 'idx_developer_accounts_company_code'
);

SET @ddl := IF(
  @has_company_code_idx = 0,
  'CREATE INDEX `idx_developer_accounts_company_code` ON `developer_accounts` (`company_code`)',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `developer_accounts` da
JOIN `config_dict_items` c
  ON c.`type_key` = 'developer_company_subject'
 AND c.`item_name` = da.`company_name`
SET da.`company_code` = c.`item_code`,
    da.`company_name` = c.`item_name`
WHERE da.`deleted_at` IS NULL
  AND (da.`company_code` IS NULL OR TRIM(da.`company_code`) = '');

UPDATE `developer_accounts`
SET `company_code` = 'US2_PIXEL',
    `company_name` = (
      SELECT c.`item_name`
      FROM `config_dict_items` c
      WHERE c.`type_key` = 'developer_company_subject'
        AND c.`item_code` = 'US2_PIXEL'
      LIMIT 1
    )
WHERE `deleted_at` IS NULL
  AND (company_code IS NULL OR TRIM(company_code) = '')
  AND `company_name` = 'Pixel美国主体';

UPDATE `developer_accounts`
SET `company_code` = 'SG2_EXP',
    `company_name` = (
      SELECT c.`item_name`
      FROM `config_dict_items` c
      WHERE c.`type_key` = 'developer_company_subject'
        AND c.`item_code` = 'SG2_EXP'
      LIMIT 1
    )
WHERE `deleted_at` IS NULL
  AND (company_code IS NULL OR TRIM(company_code) = '')
  AND `company_name` = 'Exp新加坡主体';

UPDATE `developer_accounts`
SET `company_code` = 'SG3_ECHO',
    `company_name` = (
      SELECT c.`item_name`
      FROM `config_dict_items` c
      WHERE c.`type_key` = 'developer_company_subject'
        AND c.`item_code` = 'SG3_ECHO'
      LIMIT 1
    )
WHERE `deleted_at` IS NULL
  AND (company_code IS NULL OR TRIM(company_code) = '')
  AND `company_name` = 'Echo新加坡主体';

UPDATE `developer_accounts` da
JOIN `config_dict_items` c
  ON c.`type_key` = 'developer_company_subject'
 AND c.`item_code` = da.`company_code`
SET da.`company_name` = c.`item_name`
WHERE da.`deleted_at` IS NULL
  AND da.`company_code` IS NOT NULL
  AND TRIM(da.`company_code`) <> '';
