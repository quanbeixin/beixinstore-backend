-- Demand Communication Records (UP)
-- Generated: 2026-03-30
-- Purpose:
-- 1) Create demand communication records table
-- 2) Create dict type demand_communication_type
-- 3) Seed default communication record types

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `work_demand_communications` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `demand_id` VARCHAR(64) NOT NULL COMMENT '关联需求ID',
  `record_type_code` VARCHAR(50) NOT NULL COMMENT '记录类型字典编码',
  `content` TEXT NOT NULL COMMENT '沟通记录内容',
  `created_by` BIGINT NOT NULL COMMENT '记录人',
  `updated_by` BIGINT NULL COMMENT '更新人',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_demand_id` (`demand_id`),
  KEY `idx_record_type_code` (`record_type_code`),
  KEY `idx_created_by` (`created_by`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='需求沟通记录表';

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT
  'demand_communication_type',
  '需求沟通记录类型',
  '用于需求详情页沟通记录、会议结论、风险提醒与决策记录分类',
  1,
  1
WHERE NOT EXISTS (
  SELECT 1
  FROM `config_dict_types`
  WHERE `type_key` = 'demand_communication_type'
);

UPDATE `config_dict_types`
SET
  `type_name` = '需求沟通记录类型',
  `description` = '用于需求详情页沟通记录、会议结论、风险提醒与决策记录分类',
  `enabled` = 1,
  `is_builtin` = 1
WHERE `type_key` = 'demand_communication_type';

UPDATE `config_dict_items`
SET `item_name` = '会议结论', `sort_order` = 10, `enabled` = 1
WHERE `type_key` = 'demand_communication_type' AND `item_code` = 'MEETING_DECISION';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_communication_type', 'MEETING_DECISION', '会议结论', 10, 1, 'blue', '需求沟通记录类型', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_communication_type' AND `item_code` = 'MEETING_DECISION'
);

UPDATE `config_dict_items`
SET `item_name` = '沟通备注', `sort_order` = 20, `enabled` = 1
WHERE `type_key` = 'demand_communication_type' AND `item_code` = 'COMM_NOTE';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_communication_type', 'COMM_NOTE', '沟通备注', 20, 1, 'gold', '需求沟通记录类型', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_communication_type' AND `item_code` = 'COMM_NOTE'
);

UPDATE `config_dict_items`
SET `item_name` = '风险提醒', `sort_order` = 30, `enabled` = 1
WHERE `type_key` = 'demand_communication_type' AND `item_code` = 'RISK_ALERT';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_communication_type', 'RISK_ALERT', '风险提醒', 30, 1, 'red', '需求沟通记录类型', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_communication_type' AND `item_code` = 'RISK_ALERT'
);

UPDATE `config_dict_items`
SET `item_name` = '决策结论', `sort_order` = 40, `enabled` = 1
WHERE `type_key` = 'demand_communication_type' AND `item_code` = 'DECISION_LOG';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_communication_type', 'DECISION_LOG', '决策结论', 40, 1, 'green', '需求沟通记录类型', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_communication_type' AND `item_code` = 'DECISION_LOG'
);
