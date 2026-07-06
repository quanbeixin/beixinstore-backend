SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `developer_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_name` VARCHAR(120) NOT NULL,
  `account_name` VARCHAR(120) NOT NULL,
  `account_id` VARCHAR(120) NULL,
  `status_code` VARCHAR(50) NOT NULL,
  `owner_user_id` BIGINT UNSIGNED NULL,
  `owner_name` VARCHAR(80) NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_developer_accounts_company` (`company_name`),
  KEY `idx_developer_accounts_status` (`status_code`),
  KEY `idx_developer_accounts_owner_user` (`owner_user_id`),
  KEY `idx_developer_accounts_owner` (`owner_name`),
  KEY `idx_developer_accounts_deleted_updated` (`deleted_at`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @has_owner_user_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'developer_accounts'
    AND COLUMN_NAME = 'owner_user_id'
);

SET @sql := IF(
  @has_owner_user_id = 0,
  'ALTER TABLE `developer_accounts` ADD COLUMN `owner_user_id` BIGINT UNSIGNED NULL AFTER `status_code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_owner_user_index := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'developer_accounts'
    AND INDEX_NAME = 'idx_developer_accounts_owner_user'
);

SET @sql := IF(
  @has_owner_user_index = 0,
  'ALTER TABLE `developer_accounts` ADD KEY `idx_developer_accounts_owner_user` (`owner_user_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_developer_account_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND COLUMN_NAME = 'developer_account_id'
);

SET @sql := IF(
  @has_developer_account_id = 0,
  'ALTER TABLE `matrix_packages` ADD COLUMN `developer_account_id` BIGINT UNSIGNED NULL AFTER `id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_developer_account_index := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_packages'
    AND INDEX_NAME = 'idx_matrix_packages_developer_account'
);

SET @sql := IF(
  @has_developer_account_index = 0,
  'ALTER TABLE `matrix_packages` ADD KEY `idx_matrix_packages_developer_account` (`developer_account_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'developer_account_status', '开发者账号状态', '矩阵包专项使用的开发者账号状态枚举。', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'developer_account_status');

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'developer_account_status', 'NORMAL', '正常', 10, 1, 'green', '可正常上包、维护、关联矩阵包'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'developer_account_status' AND `item_code` = 'NORMAL'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'developer_account_status', 'RISK', '风险', 20, 1, 'gold', '存在风控、审核异常或资料问题，需要关注'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'developer_account_status' AND `item_code` = 'RISK'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'developer_account_status', 'BANNED', '封禁', 30, 1, 'red', '账号不可用，相关矩阵包需要重点识别'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'developer_account_status' AND `item_code` = 'BANNED'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'developer_account_status', 'DISABLED', '停用', 40, 1, 'default', '主动停用或不再维护'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'developer_account_status' AND `item_code` = 'DISABLED'
);
