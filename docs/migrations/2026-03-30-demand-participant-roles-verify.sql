-- Demand Participant Roles (VERIFY)
-- Generated: 2026-03-30

SET NAMES utf8mb4;

SELECT
  COLUMN_NAME,
  DATA_TYPE,
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'work_demands'
  AND COLUMN_NAME = 'participant_roles_json';

SELECT
  type_key,
  type_name,
  enabled,
  is_builtin
FROM config_dict_types
WHERE type_key = 'demand_participant_role';

SELECT
  item_code,
  item_name,
  sort_order,
  enabled
FROM config_dict_items
WHERE type_key = 'demand_participant_role'
ORDER BY sort_order ASC, id ASC;
