-- MySQL dump 10.13  Distrib 8.0.45, for macos15 (arm64)
--
-- Host: rm-2zeb75oaa1j9et13a3o.mysql.rds.aliyuncs.com    Database: beixin_store_db
-- ------------------------------------------------------
-- Server version	8.0.36

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `agent_configs`
--

DROP TABLE IF EXISTS `agent_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_configs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agent_code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `agent_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_purpose` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scene_code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `system_prompt` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `output_format_instruction` text COLLATE utf8mb4_unicode_ci,
  `temperature` decimal(4,2) NOT NULL DEFAULT '0.70',
  `max_tokens` int NOT NULL DEFAULT '2000',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '100',
  `created_by` bigint DEFAULT NULL,
  `updated_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_agent_configs_code` (`agent_code`),
  KEY `idx_agent_configs_scene_enabled_sort` (`scene_code`,`enabled`,`sort_order`),
  KEY `idx_agent_configs_updated_by` (`updated_by`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `agent_execution_logs`
--

DROP TABLE IF EXISTS `agent_execution_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_execution_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `scene_code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `agent_id` bigint NOT NULL,
  `triggered_by` bigint NOT NULL,
  `trigger_source` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `request_payload_json` json DEFAULT NULL,
  `context_summary` longtext COLLATE utf8mb4_unicode_ci,
  `response_text` longtext COLLATE utf8mb4_unicode_ci,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `started_at` datetime NOT NULL,
  `finished_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_agent_execution_logs_scene` (`scene_code`),
  KEY `idx_agent_execution_logs_agent` (`agent_id`),
  KEY `idx_agent_execution_logs_user` (`triggered_by`),
  KEY `idx_agent_execution_logs_status` (`status`),
  KEY `idx_agent_execution_logs_started` (`started_at`)
) ENGINE=InnoDB AUTO_INCREMENT=80 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bug_attachments`
--

DROP TABLE IF EXISTS `bug_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bug_attachments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `bug_id` bigint NOT NULL COMMENT '关联Bug',
  `file_name` varchar(255) NOT NULL COMMENT '原始文件名',
  `file_ext` varchar(50) DEFAULT NULL COMMENT '文件后缀',
  `file_size` bigint DEFAULT NULL COMMENT '文件大小',
  `mime_type` varchar(100) DEFAULT NULL COMMENT 'MIME类型',
  `storage_provider` varchar(50) NOT NULL DEFAULT 'ALIYUN_OSS' COMMENT '存储服务商',
  `bucket_name` varchar(100) DEFAULT NULL COMMENT 'Bucket名称',
  `object_key` varchar(500) NOT NULL COMMENT '对象Key',
  `object_url` varchar(1000) DEFAULT NULL COMMENT '访问地址',
  `uploaded_by` bigint NOT NULL COMMENT '上传人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bug_id` (`bug_id`),
  KEY `idx_uploaded_by` (`uploaded_by`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Bug附件表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bug_status_logs`
--

DROP TABLE IF EXISTS `bug_status_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bug_status_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `bug_id` bigint NOT NULL COMMENT '关联Bug',
  `from_status_code` varchar(50) DEFAULT NULL COMMENT '变更前状态',
  `to_status_code` varchar(50) NOT NULL COMMENT '变更后状态',
  `operator_id` bigint NOT NULL COMMENT '操作人',
  `remark` text COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bug_id` (`bug_id`),
  KEY `idx_operator_id` (`operator_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Bug状态变更日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bugs`
--

DROP TABLE IF EXISTS `bugs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bugs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `bug_no` varchar(32) DEFAULT NULL COMMENT 'Bug业务编号',
  `title` varchar(200) NOT NULL COMMENT 'Bug标题',
  `description` text NOT NULL COMMENT 'Bug描述',
  `severity_code` varchar(50) NOT NULL COMMENT '严重程度字典编码',
  `priority_code` varchar(50) NOT NULL COMMENT '优先级字典编码',
  `bug_type_code` varchar(50) DEFAULT NULL COMMENT 'Bug类型字典编码',
  `status_code` varchar(50) NOT NULL COMMENT '状态字典编码',
  `product_code` varchar(50) DEFAULT NULL COMMENT '产品模块字典编码',
  `issue_stage` varchar(50) DEFAULT NULL COMMENT 'Bug阶段字典编码',
  `reproduce_steps` text NOT NULL COMMENT '重现步骤',
  `expected_result` text NOT NULL COMMENT '预期结果',
  `actual_result` text NOT NULL COMMENT '实际结果',
  `environment_info` text COMMENT '环境信息',
  `demand_id` varchar(64) DEFAULT NULL COMMENT '关联需求ID',
  `reporter_id` bigint NOT NULL COMMENT '发现人',
  `assignee_id` bigint NOT NULL COMMENT '处理人',
  `fix_solution` text COMMENT '修复方案',
  `verify_result` text COMMENT '验证结果',
  `closed_at` datetime DEFAULT NULL COMMENT '关闭时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
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
  KEY `idx_created_at` (`created_at`),
  KEY `idx_issue_stage` (`issue_stage`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Bug主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `config_dict_items`
--

DROP TABLE IF EXISTS `config_dict_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `config_dict_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `type_key` varchar(64) NOT NULL,
  `item_code` varchar(64) NOT NULL,
  `item_name` varchar(64) NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `color` varchar(32) DEFAULT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `extra_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_item_code` (`type_key`,`item_code`),
  KEY `idx_type_sort` (`type_key`,`sort_order`,`id`),
  CONSTRAINT `fk_dict_items_type_key` FOREIGN KEY (`type_key`) REFERENCES `config_dict_types` (`type_key`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=141 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `config_dict_types`
--

DROP TABLE IF EXISTS `config_dict_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `config_dict_types` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `type_key` varchar(64) NOT NULL,
  `type_name` varchar(64) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `is_builtin` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_key` (`type_key`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `departments`
--

DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `parent_id` int DEFAULT NULL,
  `manager_user_id` int DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_departments_parent` (`parent_id`),
  CONSTRAINT `departments_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `departments` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `efficiency_factor_settings`
--

DROP TABLE IF EXISTS `efficiency_factor_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `efficiency_factor_settings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `factor_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '系数类型：JOB_LEVEL_WEIGHT / TASK_DIFFICULTY_WEIGHT',
  `item_code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '对应字典项编码',
  `item_name_snapshot` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '保存时的字典项名称快照',
  `coefficient` decimal(10,2) NOT NULL DEFAULT '1.00' COMMENT '系数值',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `remark` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `updated_by` bigint DEFAULT NULL COMMENT '最后维护人',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_efficiency_factor_type_item` (`factor_type`,`item_code`),
  KEY `idx_efficiency_factor_updated_by` (`updated_by`)
) ENGINE=InnoDB AUTO_INCREMENT=68 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='效能系数配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `feishu_user_bindings`
--

DROP TABLE IF EXISTS `feishu_user_bindings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `feishu_user_bindings` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `feishu_snapshot_id` bigint DEFAULT NULL,
  `open_id` varchar(191) NOT NULL,
  `union_id` varchar(191) DEFAULT NULL,
  `feishu_user_id` varchar(191) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_feishu_binding_user_id` (`user_id`),
  UNIQUE KEY `uk_feishu_binding_open_id` (`open_id`),
  KEY `idx_feishu_binding_snapshot_id` (`feishu_snapshot_id`),
  KEY `idx_feishu_binding_union_id` (`union_id`),
  KEY `idx_feishu_binding_user_open` (`feishu_user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=60 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `feishu_user_snapshots`
--

DROP TABLE IF EXISTS `feishu_user_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `feishu_user_snapshots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `app_id` varchar(128) NOT NULL DEFAULT '',
  `tenant_key` varchar(128) DEFAULT NULL,
  `open_id` varchar(191) NOT NULL,
  `union_id` varchar(191) DEFAULT NULL,
  `feishu_user_id` varchar(191) DEFAULT NULL,
  `name` varchar(128) NOT NULL DEFAULT '',
  `en_name` varchar(128) DEFAULT NULL,
  `nickname` varchar(128) DEFAULT NULL,
  `mobile` varchar(64) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `enterprise_email` varchar(191) DEFAULT NULL,
  `employee_no` varchar(64) DEFAULT NULL,
  `avatar_url` varchar(500) DEFAULT NULL,
  `department_ids_text` longtext,
  `department_names_text` longtext,
  `primary_department_id` varchar(191) DEFAULT NULL,
  `primary_department_name` varchar(191) DEFAULT NULL,
  `leader_user_id` varchar(191) DEFAULT NULL,
  `job_title` varchar(191) DEFAULT NULL,
  `city` varchar(128) DEFAULT NULL,
  `country` varchar(64) DEFAULT NULL,
  `work_station` varchar(191) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_resigned` tinyint(1) NOT NULL DEFAULT '0',
  `status_text` longtext,
  `raw_payload` longtext,
  `sync_batch_id` varchar(64) DEFAULT NULL,
  `last_synced_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_feishu_open_id` (`open_id`),
  KEY `idx_feishu_union_id` (`union_id`),
  KEY `idx_feishu_user_id` (`feishu_user_id`),
  KEY `idx_feishu_mobile` (`mobile`),
  KEY `idx_feishu_email` (`email`),
  KEY `idx_feishu_active` (`is_active`,`is_resigned`),
  KEY `idx_feishu_sync_time` (`last_synced_at`)
) ENGINE=InnoDB AUTO_INCREMENT=1226 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `menu_visibility_rules`
--

DROP TABLE IF EXISTS `menu_visibility_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_visibility_rules` (
  `menu_key` varchar(128) NOT NULL,
  `scope_type` varchar(32) NOT NULL DEFAULT 'ALL',
  `department_id` int DEFAULT NULL,
  `department_ids_json` json DEFAULT NULL,
  `role_keys_json` json DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`menu_key`),
  KEY `idx_scope_dept` (`scope_type`,`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `node_status_logs`
--

DROP TABLE IF EXISTS `node_status_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `node_status_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `node_id` bigint NOT NULL COMMENT '关联节点ID',
  `from_status` varchar(20) DEFAULT NULL COMMENT '变更前状态',
  `to_status` varchar(20) NOT NULL COMMENT '变更后状态',
  `operator_id` bigint NOT NULL COMMENT '操作人',
  `operation_type` varchar(20) DEFAULT NULL COMMENT '操作类型',
  `remark` text COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_node_id` (`node_id`),
  KEY `idx_operator_id` (`operator_id`)
) ENGINE=InnoDB AUTO_INCREMENT=88 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='节点状态变更日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notification_config`
--

DROP TABLE IF EXISTS `notification_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `scene` varchar(50) NOT NULL COMMENT '通知场景',
  `enabled` tinyint NOT NULL DEFAULT '1' COMMENT '是否启用',
  `receiver_roles` json DEFAULT NULL COMMENT '接收角色列表',
  `advance_days` int NOT NULL DEFAULT '1' COMMENT '提前天数',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_scene` (`scene`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notification_trigger_cursor`
--

DROP TABLE IF EXISTS `notification_trigger_cursor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_trigger_cursor` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `rule_id` bigint unsigned NOT NULL,
  `trigger_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expire_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_trigger_key` (`rule_id`,`trigger_key`),
  KEY `idx_expire_at` (`expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `permission_code` varchar(128) DEFAULT NULL,
  `permission_name` varchar(128) DEFAULT NULL,
  `module_key` varchar(64) DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `name` varchar(128) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `uk_permission_code` (`permission_code`)
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pm_activity_logs`
--

DROP TABLE IF EXISTS `pm_activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_activity_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int DEFAULT NULL,
  `requirement_id` int DEFAULT NULL,
  `bug_id` int DEFAULT NULL,
  `entity_type` varchar(20) NOT NULL,
  `entity_id` int NOT NULL,
  `action` varchar(50) NOT NULL,
  `action_detail` text,
  `operator_user_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pm_activity_logs_project_id` (`project_id`),
  KEY `idx_pm_activity_logs_requirement_id` (`requirement_id`),
  KEY `idx_pm_activity_logs_bug_id` (`bug_id`),
  KEY `idx_pm_activity_logs_entity` (`entity_type`,`entity_id`),
  KEY `idx_pm_activity_logs_operator_user_id` (`operator_user_id`),
  CONSTRAINT `fk_pm_activity_logs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `pm_bugs` (`id`),
  CONSTRAINT `fk_pm_activity_logs_operator_user_id` FOREIGN KEY (`operator_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_pm_activity_logs_project_id` FOREIGN KEY (`project_id`) REFERENCES `pm_projects` (`id`),
  CONSTRAINT `fk_pm_activity_logs_requirement_id` FOREIGN KEY (`requirement_id`) REFERENCES `pm_requirements` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pm_bugs`
--

DROP TABLE IF EXISTS `pm_bugs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_bugs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bug_code` varchar(20) DEFAULT NULL,
  `project_id` int NOT NULL,
  `requirement_id` int DEFAULT NULL,
  `demand_id` varchar(20) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `description` text,
  `reproduce_steps` text,
  `severity` varchar(20) NOT NULL DEFAULT 'MEDIUM',
  `status` varchar(20) NOT NULL DEFAULT 'OPEN',
  `stage` varchar(20) NOT NULL DEFAULT 'DEVELOPMENT',
  `assignee_user_id` int DEFAULT NULL,
  `estimated_hours` decimal(10,2) NOT NULL DEFAULT '0.00',
  `actual_hours` decimal(10,2) NOT NULL DEFAULT '0.00',
  `due_date` date DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pm_bugs_bug_code` (`bug_code`),
  KEY `idx_pm_bugs_project_id` (`project_id`),
  KEY `idx_pm_bugs_requirement_id` (`requirement_id`),
  KEY `idx_pm_bugs_status` (`status`),
  KEY `idx_pm_bugs_severity` (`severity`),
  KEY `idx_pm_bugs_assignee_user_id` (`assignee_user_id`),
  KEY `idx_pm_bugs_demand_id` (`demand_id`),
  CONSTRAINT `fk_pm_bugs_assignee_user_id` FOREIGN KEY (`assignee_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_pm_bugs_project_id` FOREIGN KEY (`project_id`) REFERENCES `pm_projects` (`id`),
  CONSTRAINT `fk_pm_bugs_requirement_id` FOREIGN KEY (`requirement_id`) REFERENCES `pm_requirements` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pm_project_members`
--

DROP TABLE IF EXISTS `pm_project_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_project_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `user_id` int NOT NULL,
  `project_role` varchar(20) NOT NULL DEFAULT 'DEV',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `joined_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pm_project_members_project_user` (`project_id`,`user_id`),
  KEY `idx_pm_project_members_user_id` (`user_id`),
  KEY `idx_pm_project_members_project_role` (`project_role`),
  CONSTRAINT `fk_pm_project_members_project_id` FOREIGN KEY (`project_id`) REFERENCES `pm_projects` (`id`),
  CONSTRAINT `fk_pm_project_members_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pm_projects`
--

DROP TABLE IF EXISTS `pm_projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_projects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `project_code` varchar(50) DEFAULT NULL,
  `description` text,
  `status` varchar(20) NOT NULL DEFAULT 'IN_PROGRESS',
  `owner_user_id` int DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pm_projects_name` (`name`),
  UNIQUE KEY `uk_pm_projects_code` (`project_code`),
  KEY `idx_pm_projects_status` (`status`),
  KEY `idx_pm_projects_owner_user_id` (`owner_user_id`),
  KEY `idx_pm_projects_created_by` (`created_by`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pm_requirements`
--

DROP TABLE IF EXISTS `pm_requirements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_requirements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text,
  `priority` varchar(20) NOT NULL DEFAULT 'MEDIUM',
  `status` varchar(20) NOT NULL DEFAULT 'TODO',
  `stage` varchar(20) NOT NULL DEFAULT 'REQUIREMENT',
  `assignee_user_id` int DEFAULT NULL,
  `estimated_hours` decimal(10,2) NOT NULL DEFAULT '0.00',
  `actual_hours` decimal(10,2) NOT NULL DEFAULT '0.00',
  `start_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pm_requirements_project_id` (`project_id`),
  KEY `idx_pm_requirements_status` (`status`),
  KEY `idx_pm_requirements_stage` (`stage`),
  KEY `idx_pm_requirements_priority` (`priority`),
  KEY `idx_pm_requirements_assignee_user_id` (`assignee_user_id`),
  CONSTRAINT `fk_pm_requirements_assignee_user_id` FOREIGN KEY (`assignee_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_pm_requirements_project_id` FOREIGN KEY (`project_id`) REFERENCES `pm_projects` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pm_user_business_lines`
--

DROP TABLE IF EXISTS `pm_user_business_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_user_business_lines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `project_id` int NOT NULL,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pm_user_business_lines_user_id` (`user_id`),
  KEY `idx_pm_user_business_lines_project_id` (`project_id`),
  CONSTRAINT `fk_pm_user_business_lines_project_id` FOREIGN KEY (`project_id`) REFERENCES `pm_projects` (`id`),
  CONSTRAINT `fk_pm_user_business_lines_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pm_workflow_instance_nodes`
--

DROP TABLE IF EXISTS `pm_workflow_instance_nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_workflow_instance_nodes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instance_id` int NOT NULL,
  `node_key` varchar(50) NOT NULL,
  `node_name_snapshot` varchar(100) NOT NULL,
  `sort_order` int NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/IN_PROGRESS/DONE/SKIPPED/RETURNED',
  `assignee_user_id` int DEFAULT NULL,
  `due_at` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pm_wf_inst_nodes_key` (`instance_id`,`node_key`),
  UNIQUE KEY `uk_pm_wf_inst_nodes_sort` (`instance_id`,`sort_order`),
  KEY `idx_pm_wf_inst_nodes_instance` (`instance_id`),
  KEY `idx_pm_wf_inst_nodes_assignee` (`assignee_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pm_workflow_instances`
--

DROP TABLE IF EXISTS `pm_workflow_instances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_workflow_instances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `demand_id` varchar(64) NOT NULL COMMENT 'work_demands.id',
  `project_id` int NOT NULL,
  `template_id` int NOT NULL,
  `template_version_no` int NOT NULL,
  `current_node_key` varchar(50) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'IN_PROGRESS' COMMENT 'IN_PROGRESS/DONE/CANCELLED',
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` datetime DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pm_wf_instances_demand_id` (`demand_id`),
  KEY `idx_pm_wf_instances_project_status` (`project_id`,`status`),
  KEY `idx_pm_wf_instances_template` (`template_id`,`template_version_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pm_workflow_operation_logs`
--

DROP TABLE IF EXISTS `pm_workflow_operation_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_workflow_operation_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `operator_user_id` int NOT NULL,
  `entity_type` varchar(20) NOT NULL COMMENT 'TEMPLATE/INSTANCE',
  `entity_id` int NOT NULL,
  `action` varchar(50) NOT NULL,
  `detail` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pm_wf_op_logs_project_time` (`project_id`,`created_at`),
  KEY `idx_pm_wf_op_logs_entity` (`entity_type`,`entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pm_workflow_template_nodes`
--

DROP TABLE IF EXISTS `pm_workflow_template_nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_workflow_template_nodes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `template_id` int NOT NULL,
  `node_key` varchar(50) NOT NULL,
  `node_name` varchar(100) NOT NULL,
  `sort_order` int NOT NULL,
  `is_required` tinyint(1) NOT NULL DEFAULT '1',
  `allow_return_to_keys` json DEFAULT NULL COMMENT '允许回退到的node_key数组',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pm_wf_tpl_nodes_key` (`template_id`,`node_key`),
  UNIQUE KEY `uk_pm_wf_tpl_nodes_sort` (`template_id`,`sort_order`),
  KEY `idx_pm_wf_tpl_nodes_template_id` (`template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pm_workflow_templates`
--

DROP TABLE IF EXISTS `pm_workflow_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pm_workflow_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL COMMENT '业务线ID(pm_projects.id)',
  `template_name` varchar(100) NOT NULL,
  `version_no` int NOT NULL DEFAULT '1',
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/DISABLED',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `default_project_id` int GENERATED ALWAYS AS ((case when (`is_default` = 1) then `project_id` else NULL end)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pm_wf_templates_project_version` (`project_id`,`version_no`),
  UNIQUE KEY `uk_pm_wf_templates_single_default` (`default_project_id`),
  KEY `idx_pm_wf_templates_project_default` (`project_id`,`is_default`),
  KEY `idx_pm_wf_templates_project_status` (`project_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_members`
--

DROP TABLE IF EXISTS `project_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `demand_id` varchar(64) NOT NULL COMMENT '关联项目ID(work_demands.id)',
  `user_id` bigint NOT NULL COMMENT '用户ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_demand_user` (`demand_id`,`user_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='项目成员表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_templates`
--

DROP TABLE IF EXISTS `project_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '模板名称',
  `description` text COMMENT '模板描述',
  `node_config` json NOT NULL COMMENT '节点流程配置',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1=启用 0=停用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='项目模板表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `role_permissions`
--

DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `role_id` int NOT NULL,
  `permission_id` int NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `permission_id` (`permission_id`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`),
  CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `role_key` varchar(64) DEFAULT NULL,
  `role_level` int NOT NULL DEFAULT '0',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `is_builtin` tinyint(1) NOT NULL DEFAULT '0',
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_roles_role_key` (`role_key`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `schema_migrations`
--

DROP TABLE IF EXISTS `schema_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schema_migrations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) NOT NULL,
  `executed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_schema_migrations_filename` (`filename`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `task_collaborators`
--

DROP TABLE IF EXISTS `task_collaborators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_collaborators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` bigint NOT NULL COMMENT '关联任务ID',
  `user_id` bigint NOT NULL COMMENT '协作人ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_user` (`task_id`,`user_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='任务协作人表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_change_logs`
--

DROP TABLE IF EXISTS `user_change_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_change_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `target_user_id` bigint DEFAULT NULL COMMENT '被操作用户ID',
  `action_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作类型',
  `action_label` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作文案',
  `source` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ADMIN' COMMENT '来源：ADMIN/SELF_REGISTER',
  `operator_user_id` bigint DEFAULT NULL COMMENT '操作人ID',
  `operator_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '操作人名称',
  `target_username` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '被操作用户名',
  `target_real_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '被操作真实姓名',
  `change_summary` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '变更摘要',
  `before_json` longtext COLLATE utf8mb4_unicode_ci COMMENT '变更前快照',
  `after_json` longtext COLLATE utf8mb4_unicode_ci COMMENT '变更后快照',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_change_logs_target_user_id` (`target_user_id`),
  KEY `idx_user_change_logs_operator_user_id` (`operator_user_id`),
  KEY `idx_user_change_logs_action_type` (`action_type`),
  KEY `idx_user_change_logs_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=192 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户管理操作日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_departments`
--

DROP TABLE IF EXISTS `user_departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_departments` (
  `user_id` int NOT NULL,
  `department_id` int NOT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`department_id`),
  KEY `idx_user_departments_department` (`department_id`),
  KEY `idx_user_departments_primary` (`user_id`,`is_primary`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_preferences`
--

DROP TABLE IF EXISTS `user_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_preferences` (
  `user_id` int NOT NULL,
  `display_name` varchar(64) DEFAULT NULL,
  `mobile` varchar(20) DEFAULT NULL,
  `default_home` varchar(64) NOT NULL DEFAULT '/work-logs',
  `date_display_mode` varchar(16) NOT NULL DEFAULT 'datetime',
  `demand_list_compact_default` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  KEY `idx_user_preferences_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_roles`
--

DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_roles` (
  `user_id` int NOT NULL,
  `role_id` int NOT NULL,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `role_id` (`role_id`),
  CONSTRAINT `user_roles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `user_roles_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `real_name` varchar(64) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `status` tinyint DEFAULT '1',
  `department_id` int DEFAULT NULL,
  `job_level` varchar(32) DEFAULT NULL COMMENT '职级编码',
  `status_code` varchar(64) NOT NULL DEFAULT 'ACTIVE',
  `include_in_metrics` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否纳入考核统计：1纳入 0不纳入',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login_at` datetime DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_login` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_department` (`department_id`),
  KEY `idx_users_real_name` (`real_name`),
  CONSTRAINT `fk_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=81 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wf_process_actions`
--

DROP TABLE IF EXISTS `wf_process_actions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_process_actions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `instance_id` bigint unsigned NOT NULL,
  `instance_node_id` bigint unsigned DEFAULT NULL,
  `action_type` varchar(64) NOT NULL,
  `from_node_key` varchar(64) DEFAULT NULL,
  `to_node_key` varchar(64) DEFAULT NULL,
  `operator_user_id` int DEFAULT NULL,
  `target_user_id` int DEFAULT NULL,
  `comment` varchar(500) DEFAULT NULL,
  `source_type` varchar(32) DEFAULT NULL,
  `source_id` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wf_actions_instance` (`instance_id`,`id`),
  KEY `idx_wf_actions_operator` (`operator_user_id`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=1032 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wf_process_instance_nodes`
--

DROP TABLE IF EXISTS `wf_process_instance_nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_process_instance_nodes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `instance_id` bigint unsigned NOT NULL,
  `node_key` varchar(64) NOT NULL,
  `node_name_snapshot` varchar(128) NOT NULL,
  `node_type` varchar(32) NOT NULL DEFAULT 'TASK',
  `phase_key` varchar(32) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `status` varchar(32) NOT NULL DEFAULT 'TODO',
  `assignee_user_id` int DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `due_at` date DEFAULT NULL,
  `remark` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `owner_estimated_hours` decimal(10,2) DEFAULT NULL COMMENT 'Owner预估工时',
  `personal_estimated_hours` decimal(10,2) DEFAULT NULL COMMENT '个人预估工时汇总',
  `actual_hours` decimal(10,2) DEFAULT NULL COMMENT '实际工时汇总',
  `planned_start_time` datetime DEFAULT NULL COMMENT '预期开始时间',
  `planned_end_time` datetime DEFAULT NULL COMMENT '预期结束时间',
  `actual_start_time` datetime DEFAULT NULL COMMENT '实际开始时间',
  `actual_end_time` datetime DEFAULT NULL COMMENT '实际结束时间',
  `reject_reason` text COMMENT '驳回原因',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wf_instance_node` (`instance_id`,`node_key`),
  KEY `idx_wf_instance_nodes_progress` (`instance_id`,`sort_order`,`status`),
  KEY `idx_wf_instance_nodes_assignee` (`assignee_user_id`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4711 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wf_process_instances`
--

DROP TABLE IF EXISTS `wf_process_instances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_process_instances` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `biz_type` varchar(32) NOT NULL DEFAULT 'DEMAND',
  `biz_id` varchar(64) NOT NULL,
  `template_id` bigint unsigned NOT NULL,
  `template_version` int NOT NULL DEFAULT '1',
  `status` varchar(32) NOT NULL DEFAULT 'IN_PROGRESS',
  `current_node_key` varchar(64) DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `ended_at` datetime DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wf_instances_biz` (`biz_type`,`biz_id`),
  KEY `idx_wf_instances_status` (`status`),
  KEY `idx_wf_instances_current_node` (`current_node_key`)
) ENGINE=InnoDB AUTO_INCREMENT=236 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wf_process_tasks`
--

DROP TABLE IF EXISTS `wf_process_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_process_tasks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `instance_id` bigint unsigned NOT NULL,
  `instance_node_id` bigint unsigned NOT NULL,
  `task_title` varchar(255) NOT NULL,
  `assignee_user_id` int NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'TODO',
  `priority` varchar(16) NOT NULL DEFAULT 'NORMAL',
  `due_at` date DEFAULT NULL,
  `source_type` varchar(32) DEFAULT NULL,
  `source_id` bigint DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `personal_estimated_hours` decimal(10,2) DEFAULT NULL COMMENT '个人预估工时',
  `actual_hours` decimal(10,2) DEFAULT NULL COMMENT '实际工时',
  `deadline` datetime DEFAULT NULL COMMENT '截止时间',
  PRIMARY KEY (`id`),
  KEY `idx_wf_tasks_assignee_status` (`assignee_user_id`,`status`,`due_at`),
  KEY `idx_wf_tasks_instance` (`instance_id`,`instance_node_id`,`status`),
  KEY `idx_deadline` (`deadline`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wf_process_template_nodes`
--

DROP TABLE IF EXISTS `wf_process_template_nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_process_template_nodes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `template_id` bigint unsigned NOT NULL,
  `node_key` varchar(64) NOT NULL,
  `node_name` varchar(128) NOT NULL,
  `node_type` varchar(32) NOT NULL DEFAULT 'TASK',
  `phase_key` varchar(32) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `allow_return_to_prev` tinyint(1) NOT NULL DEFAULT '1',
  `assignee_rule` varchar(32) NOT NULL DEFAULT 'MANUAL',
  `extra_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wf_template_node` (`template_id`,`node_key`),
  KEY `idx_wf_template_nodes_sort` (`template_id`,`sort_order`,`id`)
) ENGINE=InnoDB AUTO_INCREMENT=863 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wf_process_templates`
--

DROP TABLE IF EXISTS `wf_process_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_process_templates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `template_key` varchar(64) NOT NULL,
  `template_name` varchar(128) NOT NULL,
  `biz_type` varchar(32) NOT NULL DEFAULT 'DEMAND',
  `version` int NOT NULL DEFAULT '1',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wf_template_key_version` (`template_key`,`version`),
  KEY `idx_wf_template_biz_default` (`biz_type`,`is_default`,`enabled`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `work_demand_communications`
--

DROP TABLE IF EXISTS `work_demand_communications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_demand_communications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `demand_id` varchar(64) NOT NULL COMMENT '关联需求ID',
  `record_type_code` varchar(50) NOT NULL COMMENT '记录类型字典编码',
  `content` text NOT NULL COMMENT '沟通记录内容',
  `created_by` bigint NOT NULL COMMENT '记录人',
  `updated_by` bigint DEFAULT NULL COMMENT '更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_demand_id` (`demand_id`),
  KEY `idx_record_type_code` (`record_type_code`),
  KEY `idx_created_by` (`created_by`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='需求沟通记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `work_demand_phases`
--

DROP TABLE IF EXISTS `work_demand_phases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_demand_phases` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `demand_id` varchar(20) NOT NULL,
  `phase_key` varchar(32) NOT NULL,
  `phase_name` varchar(64) NOT NULL,
  `owner_user_id` int DEFAULT NULL,
  `estimate_hours` decimal(6,1) NOT NULL DEFAULT '0.0',
  `status` varchar(20) NOT NULL DEFAULT 'TODO',
  `sort_order` int NOT NULL DEFAULT '0',
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_demand_phase` (`demand_id`,`phase_key`),
  KEY `idx_phase_owner_status` (`owner_user_id`,`status`),
  KEY `idx_phase_demand_sort` (`demand_id`,`sort_order`,`id`)
) ENGINE=InnoDB AUTO_INCREMENT=71 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `work_demands`
--

DROP TABLE IF EXISTS `work_demands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_demands` (
  `id` varchar(20) NOT NULL,
  `name` varchar(200) NOT NULL,
  `owner_user_id` int NOT NULL,
  `business_group_code` varchar(64) DEFAULT NULL,
  `expected_release_date` date DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'TODO',
  `priority` varchar(10) NOT NULL DEFAULT 'P2',
  `owner_estimate_hours` decimal(6,1) DEFAULT NULL,
  `description` text,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `management_mode` varchar(20) NOT NULL DEFAULT 'simple' COMMENT 'simple/advanced',
  `template_id` int DEFAULT NULL COMMENT '关联模板ID',
  `participant_roles_json` json DEFAULT NULL,
  `project_manager` bigint DEFAULT NULL COMMENT '项目负责人',
  `health_status` varchar(10) NOT NULL DEFAULT 'green' COMMENT '健康度 red/yellow/green',
  `actual_start_time` datetime DEFAULT NULL COMMENT '实际开始时间',
  `actual_end_time` datetime DEFAULT NULL COMMENT '实际结束时间',
  `doc_link` varchar(500) DEFAULT NULL COMMENT 'PRD文档链接',
  `ui_design_link` varchar(500) DEFAULT NULL COMMENT 'UI设计稿地址',
  `test_case_link` varchar(500) DEFAULT NULL COMMENT '测试用例CASE地址',
  `overall_estimated_hours` decimal(8,1) NOT NULL DEFAULT '0.0' COMMENT '需求整体预估用时(h)',
  `overall_actual_hours` decimal(8,1) NOT NULL DEFAULT '0.0' COMMENT '需求整体实际用时(h)',
  PRIMARY KEY (`id`),
  KEY `idx_work_demands_owner` (`owner_user_id`),
  KEY `idx_work_demands_status_priority` (`status`,`priority`),
  KEY `idx_work_demands_created_at` (`created_at`),
  KEY `idx_work_demands_business_group_code` (`business_group_code`),
  KEY `idx_work_demands_expected_release_date` (`expected_release_date`),
  KEY `idx_template_id` (`template_id`),
  KEY `idx_project_manager` (`project_manager`),
  KEY `idx_health_status` (`health_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `work_item_types`
--

DROP TABLE IF EXISTS `work_item_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_item_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type_key` varchar(64) NOT NULL,
  `name` varchar(64) NOT NULL,
  `require_demand` tinyint(1) NOT NULL DEFAULT '0',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_work_item_types_key` (`type_key`),
  KEY `idx_work_item_types_enabled_sort` (`enabled`,`sort_order`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `work_log_daily_entries`
--

DROP TABLE IF EXISTS `work_log_daily_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_log_daily_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `log_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `entry_date` date NOT NULL,
  `actual_hours` decimal(6,1) NOT NULL DEFAULT '0.0',
  `description` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_work_log_daily_entry_user_date` (`user_id`,`entry_date`),
  KEY `idx_work_log_daily_entry_log_date` (`log_id`,`entry_date`)
) ENGINE=InnoDB AUTO_INCREMENT=860 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `work_log_daily_plans`
--

DROP TABLE IF EXISTS `work_log_daily_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_log_daily_plans` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `log_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `plan_date` date NOT NULL,
  `planned_hours` decimal(6,1) NOT NULL DEFAULT '0.0',
  `source` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SYSTEM_SPLIT',
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_work_log_daily_plan_log_date` (`log_id`,`plan_date`),
  KEY `idx_work_log_daily_plan_user_date` (`user_id`,`plan_date`),
  KEY `idx_work_log_daily_plan_date` (`plan_date`)
) ENGINE=InnoDB AUTO_INCREMENT=5866 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `work_logs`
--

DROP TABLE IF EXISTS `work_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `log_date` date NOT NULL,
  `item_type_id` int NOT NULL,
  `description` text NOT NULL,
  `personal_estimate_hours` decimal(5,1) NOT NULL DEFAULT '0.0',
  `self_task_difficulty_code` varchar(32) DEFAULT NULL COMMENT '个人预估任务难度字典编码，仅个人填报维护使用',
  `actual_hours` decimal(5,1) NOT NULL,
  `owner_estimate_hours` decimal(5,1) DEFAULT NULL,
  `task_difficulty_code` varchar(32) DEFAULT NULL COMMENT '任务难度字典编码，仅 Owner 内部评估使用',
  `owner_estimated_by` int DEFAULT NULL,
  `owner_estimated_at` datetime DEFAULT NULL,
  `remaining_hours` decimal(5,1) NOT NULL DEFAULT '0.0',
  `log_status` varchar(20) NOT NULL DEFAULT 'IN_PROGRESS',
  `task_source` varchar(20) NOT NULL DEFAULT 'SELF' COMMENT '任务来源: SELF/OWNER_ASSIGN/WORKFLOW_AUTO',
  `demand_id` varchar(20) DEFAULT NULL,
  `phase_key` varchar(32) DEFAULT NULL,
  `assigned_by_user_id` int DEFAULT NULL COMMENT '指派人用户ID',
  `expected_start_date` date DEFAULT NULL,
  `expected_completion_date` date DEFAULT NULL,
  `log_completed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `relate_task_id` bigint DEFAULT NULL COMMENT '关联任务ID',
  PRIMARY KEY (`id`),
  KEY `idx_work_logs_user_date` (`user_id`,`log_date`),
  KEY `idx_work_logs_demand` (`demand_id`),
  KEY `idx_work_logs_log_date` (`log_date`),
  KEY `idx_work_logs_item_type` (`item_type_id`),
  KEY `idx_work_logs_demand_phase_date` (`demand_id`,`phase_key`,`log_date`),
  KEY `idx_work_logs_owner_estimated_by` (`owner_estimated_by`),
  KEY `idx_work_logs_assigned_by_user_id` (`assigned_by_user_id`),
  KEY `idx_relate_task_id` (`relate_task_id`),
  KEY `idx_task_difficulty_code` (`task_difficulty_code`),
  KEY `idx_self_task_difficulty_code` (`self_task_difficulty_code`)
) ENGINE=InnoDB AUTO_INCREMENT=1350 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping events for database 'beixin_store_db'
--

--
-- Dumping routines for database 'beixin_store_db'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-07 19:08:04
