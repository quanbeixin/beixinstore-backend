-- Demand tech solution fields (VERIFY)
-- Generated: 2026-04-15

SET NAMES utf8mb4;

SELECT
  column_name,
  column_type,
  is_nullable,
  column_comment
FROM information_schema.COLUMNS
WHERE table_schema = DATABASE()
  AND table_name = 'work_demands'
  AND column_name IN ('frontend_tech_solution', 'backend_tech_solution')
ORDER BY column_name ASC;
