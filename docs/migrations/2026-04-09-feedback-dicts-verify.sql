-- Feedback Dicts Migration (VERIFY)
-- Generated: 2026-04-09

SET NAMES utf8mb4;

SELECT
  type_key,
  type_name,
  enabled,
  is_builtin
FROM config_dict_types
WHERE type_key IN ('feedback_product', 'feedback_channel')
ORDER BY type_key ASC;

SELECT
  type_key,
  item_code,
  item_name,
  sort_order,
  enabled
FROM config_dict_items
WHERE type_key IN ('feedback_product', 'feedback_channel')
ORDER BY type_key ASC, sort_order ASC, id ASC;
