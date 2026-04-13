-- Demand release fields (UP)
-- Generated: 2026-04-13
-- Purpose: add code_branch and release_note to work_demands.

SET NAMES utf8mb4;

SET @code_branch_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'code_branch'
);

SET @sql_add_code_branch := IF(
  @code_branch_exists = 0,
  'ALTER TABLE `work_demands` ADD COLUMN `code_branch` VARCHAR(255) NULL COMMENT ''代码分支（选填）'' AFTER `test_case_link`',
  'SELECT ''[skip] work_demands.code_branch already exists'' AS message'
);
PREPARE stmt_add_code_branch FROM @sql_add_code_branch;
EXECUTE stmt_add_code_branch;
DEALLOCATE PREPARE stmt_add_code_branch;

SET @release_note_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'release_note'
);

SET @sql_add_release_note := IF(
  @release_note_exists = 0,
  'ALTER TABLE `work_demands` ADD COLUMN `release_note` TEXT NULL COMMENT ''备注信息（上线表）'' AFTER `code_branch`',
  'SELECT ''[skip] work_demands.release_note already exists'' AS message'
);
PREPARE stmt_add_release_note FROM @sql_add_release_note;
EXECUTE stmt_add_release_note;
DEALLOCATE PREPARE stmt_add_release_note;
