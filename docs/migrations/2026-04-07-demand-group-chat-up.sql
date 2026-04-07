-- Add demand group chat setting fields

SET @add_group_chat_mode_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'work_demands'
      AND COLUMN_NAME = 'group_chat_mode'
  ),
  'SELECT ''[skip] work_demands.group_chat_mode already exists'' AS message',
  'ALTER TABLE work_demands ADD COLUMN group_chat_mode VARCHAR(20) NOT NULL DEFAULT ''none'' COMMENT ''拉群方式: auto/none/bind'' AFTER health_status'
);
PREPARE stmt FROM @add_group_chat_mode_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_group_chat_id_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'work_demands'
      AND COLUMN_NAME = 'group_chat_id'
  ),
  'SELECT ''[skip] work_demands.group_chat_id already exists'' AS message',
  'ALTER TABLE work_demands ADD COLUMN group_chat_id VARCHAR(128) NULL COMMENT ''绑定飞书群 chat_id'' AFTER group_chat_mode'
);
PREPARE stmt FROM @add_group_chat_id_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_idx_group_chat_mode_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'work_demands'
      AND INDEX_NAME = 'idx_work_demands_group_chat_mode'
  ),
  'SELECT ''[skip] idx_work_demands_group_chat_mode already exists'' AS message',
  'ALTER TABLE work_demands ADD INDEX idx_work_demands_group_chat_mode (group_chat_mode)'
);
PREPARE stmt FROM @add_idx_group_chat_mode_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
