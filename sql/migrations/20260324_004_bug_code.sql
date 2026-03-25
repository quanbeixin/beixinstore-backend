SET @pm_bugs_bug_code_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pm_bugs'
    AND COLUMN_NAME = 'bug_code'
);

SET @pm_bugs_bug_code_col_sql := IF(
  @pm_bugs_bug_code_col_exists = 0,
  'ALTER TABLE pm_bugs ADD COLUMN bug_code VARCHAR(20) DEFAULT NULL AFTER id',
  'SELECT 1'
);
PREPARE pm_bugs_bug_code_col_stmt FROM @pm_bugs_bug_code_col_sql;
EXECUTE pm_bugs_bug_code_col_stmt;
DEALLOCATE PREPARE pm_bugs_bug_code_col_stmt;

UPDATE pm_bugs
SET bug_code = CONCAT('BUG', LPAD(CAST(id AS CHAR), 3, '0'))
WHERE (bug_code IS NULL OR TRIM(bug_code) = '')
  AND is_deleted = 0;

SET @pm_bugs_bug_code_uk_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pm_bugs'
    AND INDEX_NAME = 'uk_pm_bugs_bug_code'
);

SET @pm_bugs_bug_code_uk_sql := IF(
  @pm_bugs_bug_code_uk_exists = 0,
  'ALTER TABLE pm_bugs ADD UNIQUE KEY uk_pm_bugs_bug_code (bug_code)',
  'SELECT 1'
);
PREPARE pm_bugs_bug_code_uk_stmt FROM @pm_bugs_bug_code_uk_sql;
EXECUTE pm_bugs_bug_code_uk_stmt;
DEALLOCATE PREPARE pm_bugs_bug_code_uk_stmt;

