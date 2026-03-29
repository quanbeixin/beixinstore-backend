-- Project Template Phase Dict (VERIFY)
-- Generated: 2026-03-29

SET NAMES utf8mb4;

SELECT
  `type_key`,
  `type_name`,
  `description`,
  `enabled`,
  `is_builtin`
FROM `config_dict_types`
WHERE `type_key` IN ('demand_phase_type', 'project_template_phase_type')
ORDER BY `type_key` ASC;

SELECT
  `type_key`,
  `item_code`,
  `item_name`,
  `sort_order`,
  `enabled`
FROM `config_dict_items`
WHERE `type_key` = 'project_template_phase_type'
ORDER BY `sort_order` ASC, `id` ASC;
