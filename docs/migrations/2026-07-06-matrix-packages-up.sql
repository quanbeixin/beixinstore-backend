SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `matrix_packages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `developer_account_id` BIGINT UNSIGNED NULL,
  `package_name` VARCHAR(120) NOT NULL,
  `app_id` VARCHAR(80) NULL,
  `new_package_version` VARCHAR(50) NULL,
  `domain_info` VARCHAR(255) NULL,
  `platform` VARCHAR(40) NULL,
  `owner_user_id` BIGINT UNSIGNED NULL,
  `owner_name` VARCHAR(80) NULL,
  `status_code` VARCHAR(50) NOT NULL,
  `health_code` VARCHAR(50) NULL,
  `production_stage_code` VARCHAR(50) NULL,
  `expected_cold_ready_date` DATE NULL,
  `latest_progress` VARCHAR(500) NULL,
  `production_checklist` JSON NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_matrix_packages_developer_account` (`developer_account_id`),
  KEY `idx_matrix_packages_status` (`status_code`),
  KEY `idx_matrix_packages_health` (`health_code`),
  KEY `idx_matrix_packages_production_stage` (`production_stage_code`),
  KEY `idx_matrix_packages_expected_cold_ready` (`expected_cold_ready_date`),
  KEY `idx_matrix_packages_owner_user` (`owner_user_id`),
  KEY `idx_matrix_packages_owner` (`owner_name`),
  KEY `idx_matrix_packages_deleted_updated` (`deleted_at`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'matrix_package_status', '矩阵包状态', '矩阵包全景图使用的包状态枚举。', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'matrix_package_status');

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'matrix_package_health', '矩阵包健康度', '仅对投放中矩阵包生效，第一版手动维护，后续可按数据规则自动判断。', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'matrix_package_health');

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'matrix_package_production_stage', '矩阵包生产节点', '冷备包生产线使用的推进节点枚举。', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'matrix_package_production_stage');

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

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_status', 'COLD_STANDBY', '冷备包', 10, 1, 'blue', '已构建完成，尚未提交商店审核'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_status' AND `item_code` = 'COLD_STANDBY'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_status', 'IN_REVIEW', '审核中', 20, 1, 'gold', '已提交商店，等待 Meta/Google 审核结果'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_status' AND `item_code` = 'IN_REVIEW'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_status', 'HOT_STANDBY', '热备包', 30, 1, 'green', '审核已通过，已上架，可随时启用投放'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_status' AND `item_code` = 'HOT_STANDBY'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_status', 'DELIVERING', '投放中', 40, 1, 'processing', '当前正在消耗预算进行投放'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_status' AND `item_code` = 'DELIVERING'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_status', 'BANNED', '已封禁', 50, 1, 'red', '被 Meta 下架或封禁'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_status' AND `item_code` = 'BANNED'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_status', 'ARCHIVED', '已归档', 60, 1, 'default', '评估无继续运营价值、重构或者停止'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_status' AND `item_code` = 'ARCHIVED'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_health', 'NORMAL', '正常', 10, 1, 'green', '表现良好，无需干预'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_health' AND `item_code` = 'NORMAL'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_health', 'WATCH', '关注', 20, 1, 'gold', '有下降趋势，建议关注'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_health' AND `item_code` = 'WATCH'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_health', 'ABNORMAL', '异常', 30, 1, 'red', '数据异常，需要立即排查'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_health' AND `item_code` = 'ABNORMAL'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'REQUIREMENT_CONFIRM', '需求确认', 10, 1, 'default', '确认包生产目标与基本信息'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'REQUIREMENT_CONFIRM'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'ASSET_PREPARE', '素材准备', 20, 1, 'blue', '准备生产所需素材与配置资料'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'ASSET_PREPARE'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'DEVELOPING', '开发中', 30, 1, 'cyan', '开发实现中'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'DEVELOPING'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'PACKAGING', '打包中', 40, 1, 'geekblue', '构建与打包中'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'PACKAGING'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'SELF_TEST', '自测中', 50, 1, 'gold', '生产完成后的内部验证'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'SELF_TEST'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`)
SELECT 'matrix_package_production_stage', 'READY_FOR_COLD_STANDBY', '待转冷备', 60, 1, 'green', '生产完成，等待标记为冷备包'
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'matrix_package_production_stage' AND `item_code` = 'READY_FOR_COLD_STANDBY'
);
