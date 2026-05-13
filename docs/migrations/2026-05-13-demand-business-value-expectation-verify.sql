-- 2026-05-13
-- Verify: work_demands.business_value_expectation exists

SELECT
  table_name,
  column_name,
  column_type,
  is_nullable,
  column_comment
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'work_demands'
  AND column_name = 'business_value_expectation';
