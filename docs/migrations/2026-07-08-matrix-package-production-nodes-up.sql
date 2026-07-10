SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `matrix_package_production_nodes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `package_id` BIGINT UNSIGNED NOT NULL,
  `node_code` VARCHAR(60) NOT NULL,
  `status_code` VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED',
  `block_reason` VARCHAR(1000) NULL,
  `started_by` BIGINT UNSIGNED NULL,
  `started_at` DATETIME NULL,
  `completed_by` BIGINT UNSIGNED NULL,
  `completed_at` DATETIME NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_matrix_package_production_node` (`package_id`, `node_code`),
  KEY `idx_matrix_package_production_node_status` (`status_code`),
  KEY `idx_matrix_package_production_node_package` (`package_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
