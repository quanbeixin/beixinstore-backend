SET NAMES utf8mb4;

SET @has_side_note_expected_date := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_package_side_notes'
    AND COLUMN_NAME = 'expected_delivery_date'
);
SET @sql := IF(
  @has_side_note_expected_date = 0,
  'ALTER TABLE `matrix_package_side_notes` ADD COLUMN `expected_delivery_date` DATETIME NULL AFTER `owner_name`',
  'SELECT ''[skip] matrix_package_side_notes.expected_delivery_date already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_side_note_expected_source := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matrix_package_side_notes'
    AND COLUMN_NAME = 'expected_delivery_date_source'
);
SET @sql := IF(
  @has_side_note_expected_source = 0,
  'ALTER TABLE `matrix_package_side_notes` ADD COLUMN `expected_delivery_date_source` VARCHAR(20) NULL AFTER `expected_delivery_date`',
  'SELECT ''[skip] matrix_package_side_notes.expected_delivery_date_source already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO `matrix_package_side_notes`
  (`package_id`, `note_type`, `content`, `expected_delivery_date`, `expected_delivery_date_source`, `created_at`, `updated_at`)
SELECT
  mp.id,
  stage_notes.note_type,
  '',
  DATE_ADD(CAST(mp.expected_cold_ready_date AS DATETIME), INTERVAL stage_notes.offset_days DAY),
  'AUTO_T',
  NOW(),
  NOW()
FROM `matrix_packages` mp
JOIN (
  SELECT 'DESIGN' AS note_type, -2 AS offset_days
  UNION ALL SELECT 'OPERATION', -2
  UNION ALL SELECT 'DEVOPS', -2
  UNION ALL SELECT 'FRONTEND', -1
  UNION ALL SELECT 'DELIVERY', -1
  UNION ALL SELECT 'BACKEND', -1
  UNION ALL SELECT 'ADVERTISING', 0
) stage_notes
WHERE mp.deleted_at IS NULL
  AND mp.expected_cold_ready_date IS NOT NULL
ON DUPLICATE KEY UPDATE
  `expected_delivery_date` = CASE
    WHEN `matrix_package_side_notes`.`expected_delivery_date` IS NULL
      OR `matrix_package_side_notes`.`expected_delivery_date_source` = 'AUTO_T'
    THEN VALUES(`expected_delivery_date`)
    ELSE `matrix_package_side_notes`.`expected_delivery_date`
  END,
  `expected_delivery_date_source` = CASE
    WHEN `matrix_package_side_notes`.`expected_delivery_date` IS NULL
      OR `matrix_package_side_notes`.`expected_delivery_date_source` = 'AUTO_T'
    THEN 'AUTO_T'
    ELSE `matrix_package_side_notes`.`expected_delivery_date_source`
  END,
  `updated_at` = CASE
    WHEN `matrix_package_side_notes`.`expected_delivery_date` IS NULL
      OR `matrix_package_side_notes`.`expected_delivery_date_source` = 'AUTO_T'
    THEN CURRENT_TIMESTAMP
    ELSE `matrix_package_side_notes`.`updated_at`
  END;
