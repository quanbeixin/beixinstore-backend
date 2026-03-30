-- Demand hour summary fields (VERIFY)
-- Generated: 2026-03-30

SET NAMES utf8mb4;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'work_demands'
  AND COLUMN_NAME IN ('overall_estimated_hours', 'overall_actual_hours')
ORDER BY COLUMN_NAME;

SELECT
  id,
  overall_estimated_hours,
  overall_actual_hours,
  updated_at
FROM work_demands
ORDER BY updated_at DESC, id DESC
LIMIT 10;
