SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `matrix_package_review_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `package_id` BIGINT UNSIGNED NOT NULL COMMENT '矩阵包ID',
  `review_stage_code` VARCHAR(50) NOT NULL DEFAULT 'PENDING_REVIEW_SUBMIT' COMMENT '送审阶段',
  `planned_first_submit_at` DATETIME NULL COMMENT '计划首次送审时间',
  `actual_first_submit_at` DATETIME NULL COMMENT '实际首次送审时间',
  `planned_second_submit_at` DATETIME NULL COMMENT '计划二次送审时间',
  `actual_second_submit_at` DATETIME NULL COMMENT '实际二次送审时间',
  `ad_account_binding_status` VARCHAR(50) NOT NULL DEFAULT 'NOT_REQUIRED' COMMENT '广告账号绑定状态',
  `owner_user_id` BIGINT UNSIGNED NULL COMMENT '送审负责人用户ID',
  `owner_name` VARCHAR(80) NULL COMMENT '送审负责人展示名',
  `remark` VARCHAR(1000) NULL COMMENT '备注',
  `created_by` BIGINT UNSIGNED NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_matrix_package_review_plan_package` (`package_id`),
  KEY `idx_matrix_package_review_plan_stage` (`review_stage_code`),
  KEY `idx_matrix_package_review_plan_owner` (`owner_user_id`),
  KEY `idx_matrix_package_review_plan_first_submit` (`planned_first_submit_at`),
  KEY `idx_matrix_package_review_plan_second_submit` (`planned_second_submit_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
