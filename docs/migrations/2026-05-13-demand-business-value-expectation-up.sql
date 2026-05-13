-- 2026-05-13
-- Purpose: add business_value_expectation to work_demands (需求业务价值预期)

SET @business_value_expectation_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'business_value_expectation'
);

SET @sql_add_business_value_expectation := IF(
  @business_value_expectation_exists = 0,
  'ALTER TABLE `work_demands` ADD COLUMN `business_value_expectation` TEXT NULL COMMENT ''需求业务价值预期'' AFTER `release_note`',
  'SELECT ''[skip] work_demands.business_value_expectation already exists'' AS message'
);

PREPARE stmt_add_business_value_expectation FROM @sql_add_business_value_expectation;
EXECUTE stmt_add_business_value_expectation;
DEALLOCATE PREPARE stmt_add_business_value_expectation;
