-- Project Template Phase Dict (UP)
-- Generated: 2026-03-29
-- Purpose:
-- 1) Rename legacy demand_phase_type display name to "需求任务"
-- 2) Create independent dict type for project template phase selection
-- 3) Seed default template phase items

SET NAMES utf8mb4;

UPDATE `config_dict_types`
SET
  `type_name` = '需求任务',
  `description` = '用于工作台、日志、报表等需求任务阶段配置'
WHERE `type_key` = 'demand_phase_type';

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT
  'project_template_phase_type',
  '需求阶段',
  '用于项目模板与项目管理流程节点的阶段配置',
  1,
  1
WHERE NOT EXISTS (
  SELECT 1
  FROM `config_dict_types`
  WHERE `type_key` = 'project_template_phase_type'
);

UPDATE `config_dict_types`
SET
  `type_name` = '需求阶段',
  `description` = '用于项目模板与项目管理流程节点的阶段配置',
  `enabled` = 1,
  `is_builtin` = 1
WHERE `type_key` = 'project_template_phase_type';

UPDATE `config_dict_items`
SET `item_name` = '需求', `sort_order` = 10, `enabled` = 1
WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'requirement';

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'project_template_phase_type', 'requirement', '需求', 10, 1, NULL, '项目模板默认阶段', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'requirement'
);

UPDATE `config_dict_items`
SET `item_name` = '规划', `sort_order` = 20, `enabled` = 1
WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'plan';

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'project_template_phase_type', 'plan', '规划', 20, 1, NULL, '项目模板默认阶段', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'plan'
);

UPDATE `config_dict_items`
SET `item_name` = '方案', `sort_order` = 30, `enabled` = 1
WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'design';

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'project_template_phase_type', 'design', '方案', 30, 1, NULL, '项目模板默认阶段', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'design'
);

UPDATE `config_dict_items`
SET `item_name` = '开发', `sort_order` = 40, `enabled` = 1
WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'develop';

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'project_template_phase_type', 'develop', '开发', 40, 1, NULL, '项目模板默认阶段', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'develop'
);

UPDATE `config_dict_items`
SET `item_name` = '测试', `sort_order` = 50, `enabled` = 1
WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'test';

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'project_template_phase_type', 'test', '测试', 50, 1, NULL, '项目模板默认阶段', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'test'
);

UPDATE `config_dict_items`
SET `item_name` = '发布', `sort_order` = 60, `enabled` = 1
WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'release';

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'project_template_phase_type', 'release', '发布', 60, 1, NULL, '项目模板默认阶段', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'release'
);

UPDATE `config_dict_items`
SET `item_name` = '运营', `sort_order` = 70, `enabled` = 1
WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'operate';

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'project_template_phase_type', 'operate', '运营', 70, 1, NULL, '项目模板默认阶段', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items`
  WHERE `type_key` = 'project_template_phase_type' AND `item_code` = 'operate'
);
