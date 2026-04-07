-- Demand role -> user mapping

SET @add_participant_role_user_map_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'work_demands'
      AND COLUMN_NAME = 'participant_role_user_map_json'
  ),
  'SELECT ''[skip] work_demands.participant_role_user_map_json already exists'' AS message',
  'ALTER TABLE work_demands ADD COLUMN participant_role_user_map_json JSON NULL COMMENT ''需求角色绑定人员映射{ROLE_KEY:user_id}'' AFTER participant_roles_json'
);
PREPARE stmt FROM @add_participant_role_user_map_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

