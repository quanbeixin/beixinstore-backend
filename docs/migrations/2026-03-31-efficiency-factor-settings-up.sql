-- Efficiency factor settings table (UP)
-- 1) create efficiency_factor_settings table

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `efficiency_factor_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `factor_type` VARCHAR(64) NOT NULL COMMENT '系数类型：JOB_LEVEL_WEIGHT / TASK_DIFFICULTY_WEIGHT',
  `item_code` VARCHAR(64) NOT NULL COMMENT '对应字典项编码',
  `item_name_snapshot` VARCHAR(128) NULL COMMENT '保存时的字典项名称快照',
  `coefficient` DECIMAL(10,2) NOT NULL DEFAULT 1.00 COMMENT '系数值',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `remark` VARCHAR(255) NULL COMMENT '备注',
  `updated_by` BIGINT NULL COMMENT '最后维护人',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_efficiency_factor_type_item` (`factor_type`, `item_code`),
  KEY `idx_efficiency_factor_updated_by` (`updated_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='效能系数配置';
