SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `matrix_package_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `matrix_package_id` BIGINT UNSIGNED NOT NULL,
  `version_number` VARCHAR(80) NOT NULL,
  `version_info` MEDIUMTEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_matrix_package_version_number` (`matrix_package_id`, `version_number`),
  KEY `idx_matrix_package_versions_package_updated` (`matrix_package_id`, `updated_at`),
  CONSTRAINT `fk_matrix_package_versions_package`
    FOREIGN KEY (`matrix_package_id`) REFERENCES `matrix_packages` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
