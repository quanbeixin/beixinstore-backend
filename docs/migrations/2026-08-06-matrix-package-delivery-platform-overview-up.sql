SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `matrix_package_delivery_platforms` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `package_id` BIGINT UNSIGNED NOT NULL,
  `platform_code` VARCHAR(50) NOT NULL,
  `channel_code` VARCHAR(50) NOT NULL,
  `status_code` VARCHAR(50) NOT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_matrix_package_delivery_platform` (`package_id`, `platform_code`),
  KEY `idx_matrix_package_delivery_platform` (`platform_code`, `status_code`),
  KEY `idx_matrix_package_delivery_channel` (`channel_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `matrix_package_delivery_platforms`
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_delivery_status', 'PENDING', '待投', 20, 1, 'gold', '等待开始投放'
WHERE NOT EXISTS (
  SELECT 1
  FROM `config_dict_items`
  WHERE `type_key` = 'matrix_package_delivery_status' AND `item_code` = 'PENDING'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_delivery_status', 'BANNED', '封禁', 40, 1, 'red', '投放平台已封禁'
WHERE NOT EXISTS (
  SELECT 1
  FROM `config_dict_items`
  WHERE `type_key` = 'matrix_package_delivery_status' AND `item_code` = 'BANNED'
);

UPDATE `config_dict_items`
SET `sort_order` = CASE `item_code`
  WHEN 'ACTIVE' THEN 10
  WHEN 'PENDING' THEN 20
  WHEN 'STOPPED' THEN 30
  WHEN 'BANNED' THEN 40
  ELSE `sort_order`
END
WHERE `type_key` = 'matrix_package_delivery_status'
  AND `item_code` IN ('ACTIVE', 'PENDING', 'STOPPED', 'BANNED');

INSERT IGNORE INTO `matrix_package_delivery_platforms`
  (`package_id`, `platform_code`, `channel_code`, `status_code`, `created_by`, `updated_by`, `created_at`, `updated_at`)
SELECT
  mp.id,
  platformDict.item_code,
  channelDict.item_code,
  statusDict.item_code,
  mp.created_by,
  mp.updated_by,
  mp.created_at,
  mp.updated_at
FROM `matrix_packages` mp
JOIN (
  SELECT 1 AS position
  UNION ALL SELECT 2
  UNION ALL SELECT 3
  UNION ALL SELECT 4
) positions
  ON positions.position <= 1 + LENGTH(mp.platform) - LENGTH(REPLACE(mp.platform, ',', ''))
JOIN `config_dict_items` platformDict
  ON platformDict.type_key = 'matrix_package_delivery_platform'
 AND platformDict.enabled = 1
 AND platformDict.item_code = UPPER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(mp.platform, ',', positions.position), ',', -1)))
JOIN `config_dict_items` channelDict
  ON channelDict.type_key = 'matrix_package_delivery_channel'
 AND channelDict.enabled = 1
 AND channelDict.item_code = mp.delivery_channel_code
JOIN `config_dict_items` statusDict
  ON statusDict.type_key = 'matrix_package_delivery_status'
 AND statusDict.enabled = 1
 AND statusDict.item_code = mp.delivery_status_code
WHERE mp.deleted_at IS NULL
  AND COALESCE(TRIM(mp.platform), '') <> '';
