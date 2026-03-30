-- Work demand links fields (VERIFY)
-- Generated: 2026-03-30

SET NAMES utf8mb4;

SELECT
  column_name,
  column_type,
  is_nullable,
  column_comment
FROM information_schema.COLUMNS
WHERE table_schema = DATABASE()
  AND table_name = 'work_demands'
  AND column_name IN ('ui_design_link', 'test_case_link')
ORDER BY column_name ASC;
