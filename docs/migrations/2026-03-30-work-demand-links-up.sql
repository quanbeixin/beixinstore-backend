-- Work demand links fields (UP)
-- Generated: 2026-03-30
-- Purpose: add UI design link and test case link to work_demands.

SET NAMES utf8mb4;

SET @ui_design_link_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'ui_design_link'
);

SET @sql_add_ui_design_link := IF(
  @ui_design_link_exists = 0,
  'ALTER TABLE `work_demands` ADD COLUMN `ui_design_link` VARCHAR(500) NULL COMMENT ''UI设计稿地址'' AFTER `doc_link`',
  'SELECT ''[skip] work_demands.ui_design_link already exists'' AS message'
);
PREPARE stmt_add_ui_design_link FROM @sql_add_ui_design_link;
EXECUTE stmt_add_ui_design_link;
DEALLOCATE PREPARE stmt_add_ui_design_link;

SET @test_case_link_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'test_case_link'
);

SET @sql_add_test_case_link := IF(
  @test_case_link_exists = 0,
  'ALTER TABLE `work_demands` ADD COLUMN `test_case_link` VARCHAR(500) NULL COMMENT ''测试用例CASE地址'' AFTER `ui_design_link`',
  'SELECT ''[skip] work_demands.test_case_link already exists'' AS message'
);
PREPARE stmt_add_test_case_link FROM @sql_add_test_case_link;
EXECUTE stmt_add_test_case_link;
DEALLOCATE PREPARE stmt_add_test_case_link;
