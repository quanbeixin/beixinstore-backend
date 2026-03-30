-- Demand Participant Roles (UP)
-- Generated: 2026-03-30
-- Purpose:
-- 1) Add work_demands.participant_roles_json
-- 2) Create dict type demand_participant_role
-- 3) Seed default demand participant roles

SET NAMES utf8mb4;

SET @db_name = DATABASE();
SET @has_participant_roles_col = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'participant_roles_json'
);
SET @alter_work_demands_sql = IF(
  @has_participant_roles_col = 0,
  'ALTER TABLE `work_demands` ADD COLUMN `participant_roles_json` JSON NULL AFTER `template_id`',
  'SELECT 1'
);
PREPARE stmt FROM @alter_work_demands_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT
  'demand_participant_role',
  '需求参与角色',
  '用于项目模板节点适配与需求流程初始化裁剪的业务参与角色配置',
  1,
  1
WHERE NOT EXISTS (
  SELECT 1
  FROM `config_dict_types`
  WHERE `type_key` = 'demand_participant_role'
);

UPDATE `config_dict_types`
SET
  `type_name` = '需求参与角色',
  `description` = '用于项目模板节点适配与需求流程初始化裁剪的业务参与角色配置',
  `enabled` = 1,
  `is_builtin` = 1
WHERE `type_key` = 'demand_participant_role';

UPDATE `config_dict_items`
SET `item_name` = '需求负责人', `sort_order` = 10, `enabled` = 1
WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'DEMAND_OWNER';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_participant_role', 'DEMAND_OWNER', '需求负责人', 10, 1, NULL, '模板节点适配角色', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'DEMAND_OWNER'
);

UPDATE `config_dict_items`
SET `item_name` = '产品经理', `sort_order` = 20, `enabled` = 1
WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'PRODUCT_MANAGER';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_participant_role', 'PRODUCT_MANAGER', '产品经理', 20, 1, NULL, '模板节点适配角色', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'PRODUCT_MANAGER'
);

UPDATE `config_dict_items`
SET `item_name` = '设计', `sort_order` = 30, `enabled` = 1
WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'DESIGNER';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_participant_role', 'DESIGNER', '设计', 30, 1, NULL, '模板节点适配角色', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'DESIGNER'
);

UPDATE `config_dict_items`
SET `item_name` = '前端开发', `sort_order` = 40, `enabled` = 1
WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'FRONTEND_DEV';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_participant_role', 'FRONTEND_DEV', '前端开发', 40, 1, NULL, '模板节点适配角色', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'FRONTEND_DEV'
);

UPDATE `config_dict_items`
SET `item_name` = '后端开发', `sort_order` = 50, `enabled` = 1
WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'BACKEND_DEV';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_participant_role', 'BACKEND_DEV', '后端开发', 50, 1, NULL, '模板节点适配角色', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'BACKEND_DEV'
);

UPDATE `config_dict_items`
SET `item_name` = '大数据开发', `sort_order` = 60, `enabled` = 1
WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'BIGDATA_DEV';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_participant_role', 'BIGDATA_DEV', '大数据开发', 60, 1, NULL, '模板节点适配角色', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'BIGDATA_DEV'
);

UPDATE `config_dict_items`
SET `item_name` = '算法开发', `sort_order` = 70, `enabled` = 1
WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'ALGORITHM_DEV';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_participant_role', 'ALGORITHM_DEV', '算法开发', 70, 1, NULL, '模板节点适配角色', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'ALGORITHM_DEV'
);

UPDATE `config_dict_items`
SET `item_name` = '测试', `sort_order` = 80, `enabled` = 1
WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'QA';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_participant_role', 'QA', '测试', 80, 1, NULL, '模板节点适配角色', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'QA'
);

UPDATE `config_dict_items`
SET `item_name` = '运营', `sort_order` = 90, `enabled` = 1
WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'OPERATIONS';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_participant_role', 'OPERATIONS', '运营', 90, 1, NULL, '模板节点适配角色', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'OPERATIONS'
);

UPDATE `config_dict_items`
SET `item_name` = '投放', `sort_order` = 100, `enabled` = 1
WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'MEDIA_BUYER';
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'demand_participant_role', 'MEDIA_BUYER', '投放', 100, 1, NULL, '模板节点适配角色', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'demand_participant_role' AND `item_code` = 'MEDIA_BUYER'
);
