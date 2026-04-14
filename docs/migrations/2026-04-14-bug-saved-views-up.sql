-- Bug saved views (UP)
-- Generated: 2026-04-14
-- Notes:
-- 1) 支持 Bug 列表筛选条件存为视图并分享。
-- 2) visibility: PRIVATE(仅自己) / SHARED(共享查看)。

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `bug_saved_views` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `view_name` VARCHAR(100) NOT NULL COMMENT '视图名称',
  `visibility` VARCHAR(16) NOT NULL DEFAULT 'PRIVATE' COMMENT 'PRIVATE/SHARED',
  `view_config` JSON NOT NULL COMMENT '筛选与分组配置JSON',
  `created_by` BIGINT NOT NULL COMMENT '创建人用户ID',
  `updated_by` BIGINT NULL COMMENT '最后编辑人用户ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bug_saved_views_creator` (`created_by`),
  KEY `idx_bug_saved_views_visibility` (`visibility`),
  KEY `idx_bug_saved_views_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Bug列表筛选视图';
