-- Bug workflow config (UP)
-- Generated: 2026-04-14
-- Notes:
-- 1) 支持 Bug 流转规则配置化管理（流程配置中心）。
-- 2) 未配置时系统会使用内置默认流转规则兜底。

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `bug_workflow_transitions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `from_status_code` VARCHAR(50) NOT NULL COMMENT '来源状态编码',
  `to_status_code` VARCHAR(50) NOT NULL COMMENT '目标状态编码',
  `action_key` VARCHAR(50) NOT NULL COMMENT '动作编码',
  `action_name` VARCHAR(50) NOT NULL COMMENT '动作名称',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `sort_order` INT NOT NULL DEFAULT 100 COMMENT '排序',
  `require_remark` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否要求备注',
  `require_fix_solution` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否要求修复方案',
  `require_verify_result` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否要求验证结果',
  `created_by` BIGINT NULL COMMENT '创建人',
  `updated_by` BIGINT NULL COMMENT '更新人',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bug_workflow_transition` (`from_status_code`, `action_key`, `to_status_code`),
  KEY `idx_bug_workflow_from_status` (`from_status_code`, `enabled`, `sort_order`),
  KEY `idx_bug_workflow_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Bug流程流转配置';
