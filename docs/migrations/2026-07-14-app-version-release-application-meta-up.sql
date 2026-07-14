SET NAMES utf8mb4;

SET @has_release_request_no := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND column_name = 'release_request_no'
);

SET @sql := IF(
  @has_release_request_no = 0,
  'ALTER TABLE app_version_releases ADD COLUMN release_request_no VARCHAR(64) NULL COMMENT ''发版申请ID'' AFTER id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_applicant_user_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND column_name = 'applicant_user_id'
);

SET @sql := IF(
  @has_applicant_user_id = 0,
  'ALTER TABLE app_version_releases ADD COLUMN applicant_user_id BIGINT UNSIGNED NULL COMMENT ''发版申请人用户ID'' AFTER related_demand_name',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_applicant_name := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND column_name = 'applicant_name'
);

SET @sql := IF(
  @has_applicant_name = 0,
  'ALTER TABLE app_version_releases ADD COLUMN applicant_name VARCHAR(80) NULL COMMENT ''发版申请人展示名'' AFTER applicant_user_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_requested_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND column_name = 'requested_at'
);

SET @sql := IF(
  @has_requested_at = 0,
  'ALTER TABLE app_version_releases ADD COLUMN requested_at DATETIME NULL COMMENT ''申请日期'' AFTER applicant_name',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE app_version_releases
SET requested_at = COALESCE(requested_at, created_at)
WHERE requested_at IS NULL;

UPDATE app_version_releases
SET applicant_user_id = COALESCE(applicant_user_id, created_by)
WHERE applicant_user_id IS NULL
  AND created_by IS NOT NULL;

UPDATE app_version_releases avr
LEFT JOIN users applicantUser
  ON applicantUser.id = avr.applicant_user_id
SET avr.applicant_name = COALESCE(NULLIF(avr.applicant_name, ''), NULLIF(applicantUser.real_name, ''), applicantUser.username)
WHERE avr.applicant_user_id IS NOT NULL
  AND COALESCE(avr.applicant_name, '') = '';

UPDATE app_version_releases
SET release_request_no = CONCAT('APPREL', DATE_FORMAT(COALESCE(requested_at, created_at, NOW()), '%Y%m%d'), LPAD(id, 6, '0'))
WHERE COALESCE(release_request_no, '') = '';

SET @has_release_request_no_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND index_name = 'uk_app_version_release_request_no'
);

SET @sql := IF(
  @has_release_request_no_index = 0,
  'ALTER TABLE app_version_releases ADD UNIQUE KEY uk_app_version_release_request_no (release_request_no)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_requested_at_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND index_name = 'idx_app_version_release_requested_at'
);

SET @sql := IF(
  @has_requested_at_index = 0,
  'ALTER TABLE app_version_releases ADD KEY idx_app_version_release_requested_at (requested_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
