-- Bug Management V1 (UP)
-- Generated: 2026-03-29
-- Notes:
-- 1) Idempotent for existing tables/data.
-- 2) Builds bug domain tables, dictionaries, permissions, and default notification scenes.

SET NAMES utf8mb4;

-- 1) bug tables
CREATE TABLE IF NOT EXISTS `bugs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `bug_no` VARCHAR(32) NULL COMMENT 'Bug业务编号',
  `title` VARCHAR(200) NOT NULL COMMENT 'Bug标题',
  `description` TEXT NOT NULL COMMENT 'Bug描述',
  `severity_code` VARCHAR(50) NOT NULL COMMENT '严重程度字典编码',
  `priority_code` VARCHAR(50) NOT NULL COMMENT '优先级字典编码',
  `bug_type_code` VARCHAR(50) NULL COMMENT 'Bug类型字典编码',
  `status_code` VARCHAR(50) NOT NULL COMMENT '状态字典编码',
  `product_code` VARCHAR(50) NULL COMMENT '产品模块字典编码',
  `reproduce_steps` TEXT NOT NULL COMMENT '重现步骤',
  `expected_result` TEXT NOT NULL COMMENT '预期结果',
  `actual_result` TEXT NOT NULL COMMENT '实际结果',
  `environment_info` TEXT NULL COMMENT '环境信息',
  `demand_id` VARCHAR(64) NULL COMMENT '关联需求ID',
  `reporter_id` BIGINT NOT NULL COMMENT '发现人',
  `assignee_id` BIGINT NOT NULL COMMENT '处理人',
  `fix_solution` TEXT NULL COMMENT '修复方案',
  `verify_result` TEXT NULL COMMENT '验证结果',
  `closed_at` DATETIME NULL COMMENT '关闭时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bug_no` (`bug_no`),
  KEY `idx_status_code` (`status_code`),
  KEY `idx_severity_code` (`severity_code`),
  KEY `idx_priority_code` (`priority_code`),
  KEY `idx_bug_type_code` (`bug_type_code`),
  KEY `idx_product_code` (`product_code`),
  KEY `idx_demand_id` (`demand_id`),
  KEY `idx_reporter_id` (`reporter_id`),
  KEY `idx_assignee_id` (`assignee_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Bug主表';

CREATE TABLE IF NOT EXISTS `bug_status_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `bug_id` BIGINT NOT NULL COMMENT '关联Bug',
  `from_status_code` VARCHAR(50) NULL COMMENT '变更前状态',
  `to_status_code` VARCHAR(50) NOT NULL COMMENT '变更后状态',
  `operator_id` BIGINT NOT NULL COMMENT '操作人',
  `remark` TEXT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bug_id` (`bug_id`),
  KEY `idx_operator_id` (`operator_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Bug状态变更日志表';

CREATE TABLE IF NOT EXISTS `bug_attachments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `bug_id` BIGINT NOT NULL COMMENT '关联Bug',
  `file_name` VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `file_ext` VARCHAR(50) NULL COMMENT '文件后缀',
  `file_size` BIGINT NULL COMMENT '文件大小',
  `mime_type` VARCHAR(100) NULL COMMENT 'MIME类型',
  `storage_provider` VARCHAR(50) NOT NULL DEFAULT 'ALIYUN_OSS' COMMENT '存储服务商',
  `bucket_name` VARCHAR(100) NULL COMMENT 'Bucket名称',
  `object_key` VARCHAR(500) NOT NULL COMMENT '对象Key',
  `object_url` VARCHAR(1000) NULL COMMENT '访问地址',
  `uploaded_by` BIGINT NOT NULL COMMENT '上传人',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bug_id` (`bug_id`),
  KEY `idx_uploaded_by` (`uploaded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Bug附件表';

-- 2) dict types
INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'bug_status', 'Bug状态', 'Bug状态字典', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'bug_status'
);

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'bug_severity', 'Bug严重程度', 'Bug严重程度字典', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'bug_severity'
);

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'bug_priority', 'Bug优先级', 'Bug优先级字典', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'bug_priority'
);

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'bug_type', 'Bug类型', 'Bug类型字典', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'bug_type'
);

INSERT INTO `config_dict_types` (`type_key`, `type_name`, `description`, `enabled`, `is_builtin`)
SELECT 'bug_product', 'Bug产品模块', 'Bug产品模块字典', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_types` WHERE `type_key` = 'bug_product'
);

-- 3) dict items
INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_status', 'NEW', '新建', 10, 1, 'blue', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_status' AND `item_code` = 'NEW'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_status', 'PROCESSING', '处理中', 20, 1, 'gold', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_status' AND `item_code` = 'PROCESSING'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_status', 'FIXED', '已修复', 30, 1, 'cyan', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_status' AND `item_code` = 'FIXED'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_status', 'CLOSED', '已关闭', 40, 1, 'green', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_status' AND `item_code` = 'CLOSED'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_status', 'REOPENED', '重新打开', 50, 1, 'red', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_status' AND `item_code` = 'REOPENED'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_severity', 'CRITICAL', '致命', 10, 1, 'red', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_severity' AND `item_code` = 'CRITICAL'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_severity', 'HIGH', '严重', 20, 1, 'volcano', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_severity' AND `item_code` = 'HIGH'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_severity', 'MEDIUM', '一般', 30, 1, 'gold', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_severity' AND `item_code` = 'MEDIUM'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_severity', 'LOW', '轻微', 40, 1, 'lime', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_severity' AND `item_code` = 'LOW'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_severity', 'SUGGESTION', '建议', 50, 1, 'default', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_severity' AND `item_code` = 'SUGGESTION'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_priority', 'URGENT', '紧急', 10, 1, 'red', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_priority' AND `item_code` = 'URGENT'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_priority', 'HIGH', '高', 20, 1, 'volcano', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_priority' AND `item_code` = 'HIGH'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_priority', 'MEDIUM', '中', 30, 1, 'gold', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_priority' AND `item_code` = 'MEDIUM'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_priority', 'LOW', '低', 40, 1, 'blue', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_priority' AND `item_code` = 'LOW'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_type', 'FUNCTION', '功能缺陷', 10, 1, 'blue', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_type' AND `item_code` = 'FUNCTION'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_type', 'UI', '界面问题', 20, 1, 'cyan', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_type' AND `item_code` = 'UI'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_type', 'PERFORMANCE', '性能问题', 30, 1, 'orange', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_type' AND `item_code` = 'PERFORMANCE'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_type', 'SECURITY', '安全漏洞', 40, 1, 'red', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_type' AND `item_code` = 'SECURITY'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_type', 'DATA', '数据问题', 50, 1, 'purple', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_type' AND `item_code` = 'DATA'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_type', 'OTHER', '其他', 60, 1, 'default', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_type' AND `item_code` = 'OTHER'
);

INSERT INTO `config_dict_items` (`type_key`, `item_code`, `item_name`, `sort_order`, `enabled`, `color`, `remark`, `extra_json`)
SELECT 'bug_product', 'GENERAL', '通用模块', 10, 1, 'blue', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `config_dict_items` WHERE `type_key` = 'bug_product' AND `item_code` = 'GENERAL'
);

-- 4) permissions
INSERT INTO `permissions` (`permission_code`, `permission_name`, `module_key`, `enabled`)
SELECT 'bug.view', '查看Bug', 'work', 1
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `permission_code` = 'bug.view');

INSERT INTO `permissions` (`permission_code`, `permission_name`, `module_key`, `enabled`)
SELECT 'bug.create', '创建Bug', 'work', 1
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `permission_code` = 'bug.create');

INSERT INTO `permissions` (`permission_code`, `permission_name`, `module_key`, `enabled`)
SELECT 'bug.update', '编辑Bug', 'work', 1
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `permission_code` = 'bug.update');

INSERT INTO `permissions` (`permission_code`, `permission_name`, `module_key`, `enabled`)
SELECT 'bug.transition', '流转Bug', 'work', 1
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `permission_code` = 'bug.transition');

INSERT INTO `permissions` (`permission_code`, `permission_name`, `module_key`, `enabled`)
SELECT 'bug.manage', '管理Bug', 'work', 1
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `permission_code` = 'bug.manage');

INSERT INTO `permissions` (`permission_code`, `permission_name`, `module_key`, `enabled`)
SELECT 'bug.delete', '删除Bug', 'work', 1
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `permission_code` = 'bug.delete');

-- 4.1 bug.view <= demand.view OR demand.manage
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT DISTINCT rp.role_id, target.id
FROM `role_permissions` rp
INNER JOIN `permissions` p_old ON p_old.id = rp.permission_id
INNER JOIN `permissions` target ON target.permission_code = 'bug.view'
LEFT JOIN `role_permissions` rp_exists
  ON rp_exists.role_id = rp.role_id
 AND rp_exists.permission_id = target.id
WHERE p_old.permission_code IN ('demand.view', 'demand.manage')
  AND rp_exists.role_id IS NULL;

-- 4.2 bug.create/update/transition <= worklog.create OR demand.manage
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT DISTINCT rp.role_id, target.id
FROM `role_permissions` rp
INNER JOIN `permissions` p_old ON p_old.id = rp.permission_id
INNER JOIN `permissions` target ON target.permission_code = 'bug.create'
LEFT JOIN `role_permissions` rp_exists
  ON rp_exists.role_id = rp.role_id
 AND rp_exists.permission_id = target.id
WHERE p_old.permission_code IN ('worklog.create', 'demand.manage')
  AND rp_exists.role_id IS NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT DISTINCT rp.role_id, target.id
FROM `role_permissions` rp
INNER JOIN `permissions` p_old ON p_old.id = rp.permission_id
INNER JOIN `permissions` target ON target.permission_code = 'bug.update'
LEFT JOIN `role_permissions` rp_exists
  ON rp_exists.role_id = rp.role_id
 AND rp_exists.permission_id = target.id
WHERE p_old.permission_code IN ('worklog.create', 'demand.manage')
  AND rp_exists.role_id IS NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT DISTINCT rp.role_id, target.id
FROM `role_permissions` rp
INNER JOIN `permissions` p_old ON p_old.id = rp.permission_id
INNER JOIN `permissions` target ON target.permission_code = 'bug.transition'
LEFT JOIN `role_permissions` rp_exists
  ON rp_exists.role_id = rp.role_id
 AND rp_exists.permission_id = target.id
WHERE p_old.permission_code IN ('worklog.create', 'demand.manage')
  AND rp_exists.role_id IS NULL;

-- 4.3 bug.manage <= demand.manage
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT DISTINCT rp.role_id, target.id
FROM `role_permissions` rp
INNER JOIN `permissions` p_old ON p_old.id = rp.permission_id
INNER JOIN `permissions` target ON target.permission_code = 'bug.manage'
LEFT JOIN `role_permissions` rp_exists
  ON rp_exists.role_id = rp.role_id
 AND rp_exists.permission_id = target.id
WHERE p_old.permission_code = 'demand.manage'
  AND rp_exists.role_id IS NULL;

-- 4.4 bug.delete <= super admin roles
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, target.id
FROM `roles` r
INNER JOIN `permissions` target ON target.permission_code = 'bug.delete'
LEFT JOIN `role_permissions` rp_exists
  ON rp_exists.role_id = r.id
 AND rp_exists.permission_id = target.id
WHERE rp_exists.role_id IS NULL
  AND (
    UPPER(COALESCE(r.role_key, '')) = 'SUPER_ADMIN'
    OR LOWER(COALESCE(r.name, '')) LIKE '%super%'
    OR LOWER(COALESCE(r.name, '')) LIKE '%超级%'
  );

-- 5) notification scenes
INSERT INTO `notification_config` (`scene`, `enabled`, `receiver_roles`, `advance_days`)
VALUES
  ('bug_assign', 1, JSON_ARRAY('bug_assignee'), 0),
  ('bug_status_change', 1, JSON_ARRAY('bug_reporter'), 0),
  ('bug_fixed', 1, JSON_ARRAY('bug_reporter'), 0),
  ('bug_reopen', 1, JSON_ARRAY('bug_assignee'), 0)
ON DUPLICATE KEY UPDATE
  `enabled` = VALUES(`enabled`),
  `receiver_roles` = VALUES(`receiver_roles`),
  `advance_days` = VALUES(`advance_days`),
  `updated_at` = CURRENT_TIMESTAMP;
