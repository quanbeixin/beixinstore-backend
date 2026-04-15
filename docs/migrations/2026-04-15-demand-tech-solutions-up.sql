-- Demand tech solution fields (UP)
-- Generated: 2026-04-15
-- Purpose: add frontend/backend tech solution text fields to work_demands.

SET NAMES utf8mb4;

SET @frontend_tech_solution_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'frontend_tech_solution'
);

SET @sql_add_frontend_tech_solution := IF(
  @frontend_tech_solution_exists = 0,
  'ALTER TABLE `work_demands` ADD COLUMN `frontend_tech_solution` TEXT NULL COMMENT ''前端技术方案'' AFTER `test_case_link`',
  'SELECT ''[skip] work_demands.frontend_tech_solution already exists'' AS message'
);
PREPARE stmt_add_frontend_tech_solution FROM @sql_add_frontend_tech_solution;
EXECUTE stmt_add_frontend_tech_solution;
DEALLOCATE PREPARE stmt_add_frontend_tech_solution;

SET @backend_tech_solution_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'backend_tech_solution'
);

SET @sql_add_backend_tech_solution := IF(
  @backend_tech_solution_exists = 0,
  'ALTER TABLE `work_demands` ADD COLUMN `backend_tech_solution` TEXT NULL COMMENT ''后端技术方案'' AFTER `frontend_tech_solution`',
  'SELECT ''[skip] work_demands.backend_tech_solution already exists'' AS message'
);
PREPARE stmt_add_backend_tech_solution FROM @sql_add_backend_tech_solution;
EXECUTE stmt_add_backend_tech_solution;
DEALLOCATE PREPARE stmt_add_backend_tech_solution;
