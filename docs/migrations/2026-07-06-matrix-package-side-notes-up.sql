SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `matrix_package_side_notes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `package_id` BIGINT UNSIGNED NOT NULL,
  `note_type` VARCHAR(50) NOT NULL,
  `content` TEXT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_matrix_package_side_note_type` (`package_id`, `note_type`),
  KEY `idx_matrix_package_side_notes_package` (`package_id`),
  KEY `idx_matrix_package_side_notes_type` (`note_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
