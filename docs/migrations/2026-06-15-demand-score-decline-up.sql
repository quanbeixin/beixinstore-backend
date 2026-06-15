-- Demand Score Decline Support

SET @add_declined_at_sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `demand_score_slots` ADD COLUMN `declined_at` DATETIME NULL AFTER `skipped_reason`',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'demand_score_slots'
    AND COLUMN_NAME = 'declined_at'
);

PREPARE stmt_add_declined_at FROM @add_declined_at_sql;
EXECUTE stmt_add_declined_at;
DEALLOCATE PREPARE stmt_add_declined_at;
