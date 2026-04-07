-- Notification core tables bootstrap (UP)
-- Date: 2026-04-02
-- Purpose:
--   Ensure notification_rules / notification_rule_receivers / notification_logs exist
--   for environments that were initialized without notification schema.

CREATE TABLE IF NOT EXISTS `notification_rules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `rule_code` varchar(64) NOT NULL,
  `rule_name` varchar(128) NOT NULL,
  `biz_domain` varchar(64) NOT NULL,
  `biz_line_id` bigint NOT NULL DEFAULT '0',
  `event_type` varchar(64) NOT NULL,
  `template_id` bigint unsigned DEFAULT NULL,
  `message_title` varchar(255) DEFAULT NULL COMMENT '规则通知标题模板',
  `message_content` text COMMENT '规则通知内容模板',
  `channels_json` json NOT NULL,
  `frequency` enum('IMMEDIATE','HOURLY','DAILY') NOT NULL DEFAULT 'DAILY',
  `trigger_condition_type` enum('ALWAYS','STATUS_IN','DEADLINE_BEFORE_HOURS') NOT NULL DEFAULT 'ALWAYS',
  `trigger_condition_json` json DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `last_triggered_at` datetime DEFAULT NULL,
  `created_by` bigint NOT NULL DEFAULT '0',
  `updated_by` bigint NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_rules_code` (`rule_code`),
  UNIQUE KEY `uk_notification_rules_bizline_event` (`biz_domain`,`biz_line_id`,`event_type`),
  KEY `idx_notification_rules_lookup` (`biz_domain`,`biz_line_id`,`event_type`,`enabled`),
  KEY `idx_notification_rules_event_enabled` (`event_type`,`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `notification_rule_receivers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `rule_id` bigint unsigned NOT NULL,
  `receiver_type` enum('USER','DEPT','ROLE','DYNAMIC') NOT NULL,
  `receiver_value` varchar(128) NOT NULL,
  `receiver_label` varchar(128) DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_rule_receivers_unique` (`rule_id`,`receiver_type`,`receiver_value`),
  KEY `idx_notification_rule_receivers_rule` (`rule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `notification_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notification_id` bigint unsigned NOT NULL,
  `receiver_id` bigint unsigned NOT NULL DEFAULT '0',
  `channel` enum('IN_APP','FEISHU') NOT NULL DEFAULT 'FEISHU',
  `attempt_no` int NOT NULL DEFAULT '1',
  `status` enum('SUCCESS','FAILED','SKIPPED') NOT NULL DEFAULT 'SUCCESS',
  `error_message` varchar(1000) DEFAULT NULL,
  `request_payload` json DEFAULT NULL,
  `response_payload` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notification_logs_receiver` (`receiver_id`,`attempt_no`),
  KEY `idx_notification_logs_notification` (`notification_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

