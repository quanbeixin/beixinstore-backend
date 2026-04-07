SELECT COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'work_demands'
  AND COLUMN_NAME = 'participant_role_user_map_json';

