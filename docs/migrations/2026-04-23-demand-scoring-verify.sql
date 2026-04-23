-- Demand Scoring Migration Verify

SELECT
  table_name,
  COUNT(*) AS exists_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND table_name IN (
    'demand_score_tasks',
    'demand_score_subjects',
    'demand_score_slots',
    'demand_score_records'
  )
GROUP BY table_name
ORDER BY table_name;

SELECT permission_code, permission_name, module_key, enabled
FROM permissions
WHERE permission_code IN ('demand.score.view', 'demand.score.result.view')
ORDER BY permission_code;

SELECT menu_key, scope_type, role_keys_json
FROM menu_visibility_rules
WHERE menu_key IN ('/demand-scores', '/demand-score-results')
ORDER BY menu_key;

SELECT item_code, item_name, sort_order, enabled, extra_json
FROM config_dict_items
WHERE type_key = 'demand_participant_role'
  AND item_code = 'PROJECT_MANAGER';
