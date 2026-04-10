-- MySQL dump 10.13  Distrib 8.0.45, for macos15 (arm64)
--
-- Host: rm-2zeb75oaa1j9et13a3o.mysql.rds.aliyuncs.com    Database: beixin_store_staging
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agent_configs`
--

LOCK TABLES `agent_configs` WRITE;
/*!40000 ALTER TABLE `agent_configs` DISABLE KEYS */;
/*!40000 ALTER TABLE `agent_configs` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agent_execution_logs`
--

LOCK TABLES `agent_execution_logs` WRITE;
/*!40000 ALTER TABLE `agent_execution_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `agent_execution_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Bug附件表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bug_attachments`
--

LOCK TABLES `bug_attachments` WRITE;
/*!40000 ALTER TABLE `bug_attachments` DISABLE KEYS */;
/*!40000 ALTER TABLE `bug_attachments` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Bug状态变更日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bug_status_logs`
--

LOCK TABLES `bug_status_logs` WRITE;
/*!40000 ALTER TABLE `bug_status_logs` DISABLE KEYS */;
INSERT INTO `bug_status_logs` VALUES (1,1,NULL,'NEW',26,'创建Bug','2026-04-03 16:00:44');
/*!40000 ALTER TABLE `bug_status_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Bug主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bugs`
--

LOCK TABLES `bugs` WRITE;
/*!40000 ALTER TABLE `bugs` DISABLE KEYS */;
INSERT INTO `bugs` VALUES (1,'BUG0001','123','123','CRITICAL','URGENT','FUNCTION','NEW',NULL,NULL,'123','123','123',NULL,NULL,26,26,NULL,NULL,NULL,'2026-04-03 16:00:44','2026-04-03 16:01:06',NULL);
/*!40000 ALTER TABLE `bugs` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=98 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `config_dict_items`
--

LOCK TABLES `config_dict_items` WRITE;
/*!40000 ALTER TABLE `config_dict_items` DISABLE KEYS */;
INSERT INTO `config_dict_items` VALUES (1,'user_status','ACTIVE','正常',10,1,'success','可正常登录和使用系统',NULL,'2026-03-19 11:11:18','2026-03-20 01:15:20'),(2,'user_status','INACTIVE','禁用',0,1,'#F5222D',NULL,NULL,'2026-03-20 01:06:35','2026-03-20 01:07:21'),(3,'user_status','DISABLED','停用',20,1,'default','禁止登录和业务操作',NULL,'2026-03-20 01:15:20','2026-03-20 01:15:20'),(4,'user_status','LOCKED','锁定',30,1,'warning','因安全策略锁定',NULL,'2026-03-20 01:15:20','2026-03-20 01:15:20'),(7,'issue_type','DEMAND_DEV','需求跟进',10,1,NULL,'migrated_from_work_item_types','{\"require_demand\": true}','2026-03-20 07:45:58','2026-03-20 09:28:05'),(8,'issue_type','BUG_FIX','线上Bug处理',20,1,NULL,'migrated_from_work_item_types','{\"require_demand\": false}','2026-03-20 07:45:58','2026-03-20 09:33:06'),(9,'issue_type','MEETING','日常会议',30,1,NULL,'migrated_from_work_item_types','{\"require_demand\": false}','2026-03-20 07:45:58','2026-03-20 09:28:20'),(10,'issue_type','DOC','文档编写',40,1,NULL,'migrated_from_work_item_types','{\"require_demand\": false}','2026-03-20 07:45:58','2026-03-20 07:45:58'),(11,'issue_type','OPS','日常运维',50,1,NULL,'migrated_from_work_item_types','{\"require_demand\": false}','2026-03-20 07:45:58','2026-03-20 07:45:58'),(16,'demand_phase_type','DESIGN','设计阶段',30,1,'#722ed1',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 2, \"owner_estimate_required\": true}','2026-03-20 08:14:20','2026-03-25 08:57:36'),(17,'demand_phase_type','DEV','前端开发',60,1,'#52c41a',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 12, \"owner_estimate_required\": true}','2026-03-20 08:14:20','2026-03-25 08:57:36'),(18,'demand_phase_type','TEST','测试阶段',70,1,'#fa8c16',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 8, \"owner_estimate_required\": true}','2026-03-20 08:14:20','2026-03-25 08:57:36'),(19,'demand_phase_type','COMPETITOR_RESEARCH','竞品调研',10,1,'#1677ff',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 1, \"owner_estimate_required\": true}','2026-03-20 09:19:38','2026-03-25 08:57:36'),(20,'demand_phase_type','PRODUCT_SOLUTION','产品方案',20,1,'#13c2c2',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 1, \"owner_estimate_required\": true}','2026-03-20 09:19:38','2026-03-25 08:57:36'),(21,'demand_phase_type','DATA_ANALYSIS','数据分析',30,1,'#2f54eb',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 1, \"owner_estimate_required\": true}','2026-03-20 09:19:38','2026-03-25 08:57:36'),(22,'demand_phase_type','PRODUCT_PLANNING','产品规划',40,1,'#722ed1',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 1, \"owner_estimate_required\": true}','2026-03-20 09:19:38','2026-03-25 08:57:36'),(23,'demand_phase_type','PRODUCT_ACCEPTANCE','产品验收',50,1,'#9254de',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 1, \"owner_estimate_required\": true}','2026-03-20 09:19:38','2026-03-25 08:57:36'),(24,'demand_phase_type','BUG_FIX','前端Bug修复',80,1,'#f5222d',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 6, \"owner_estimate_required\": true}','2026-03-20 09:19:38','2026-03-25 08:57:36'),(25,'demand_phase_type','RELEASE_FOLLOWUP','上线跟进',90,1,'#faad14',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 8, \"owner_estimate_required\": true}','2026-03-20 09:19:38','2026-03-25 08:57:36'),(28,'demand_phase_type','TECH_SOLUTION_WEB','前端方案',55,1,'#1890ff',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 6, \"owner_estimate_required\": true}','2026-03-20 15:42:47','2026-03-25 08:57:36'),(29,'demand_phase_type','TECH_SOLUTION_BACK','后端方案',56,1,NULL,NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 7, \"owner_estimate_required\": true}','2026-03-20 15:44:07','2026-03-25 08:57:36'),(30,'demand_phase_type','DEV_BACK','后端开发',61,1,'#F5222D',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 7, \"owner_estimate_required\": true}','2026-03-20 15:45:34','2026-03-25 08:57:36'),(31,'demand_phase_type','BUG_FIX_BACK','后端bug修复',81,1,NULL,NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 7, \"owner_estimate_required\": true}','2026-03-20 15:50:28','2026-03-25 08:57:36'),(32,'business_group','ACQUISITION_GROWTH','获客增长侧',10,1,'#1677ff',NULL,NULL,'2026-03-20 16:20:05','2026-03-20 16:20:05'),(33,'business_group','USER_VALUE','用户价值侧',20,1,'#13c2c2',NULL,NULL,'2026-03-20 16:20:05','2026-03-20 16:20:05'),(34,'business_group','SUPPLY_CAPABILITY','供给能力侧',30,1,'#52c41a',NULL,NULL,'2026-03-20 16:20:05','2026-03-20 16:20:05'),(35,'business_group','STABILITY_GUARANTEE','稳定保障侧',40,1,'#fa8c16',NULL,NULL,'2026-03-20 16:20:05','2026-03-20 16:20:05'),(36,'business_group','PROFESSIONAL_FUNCTION','专业职能侧',50,1,'#722ed1',NULL,NULL,'2026-03-20 16:20:05','2026-03-20 16:20:05'),(37,'demand_phase_type','TEST_CASE','测试用例',32,1,'#FAAD14',NULL,'{\"usage_scope\": \"candidate_only\", \"editable_hint\": \"仅影响候选词，不直接影响在途需求流程\", \"runtime_source\": \"workflow_template\", \"owner_department_id\": 8, \"owner_estimate_required\": true}','2026-03-23 02:40:13','2026-03-25 08:57:36'),(38,'business_line','A1','A1',0,1,NULL,NULL,NULL,'2026-03-24 06:26:21','2026-03-24 06:26:21'),(39,'business_line','WEGIC','wegic',0,1,NULL,NULL,NULL,'2026-03-24 06:26:33','2026-03-24 06:26:33'),(40,'bug_status','NEW','新建',10,1,'blue',NULL,NULL,'2026-04-03 07:16:29','2026-04-03 07:16:29'),(41,'bug_status','PROCESSING','处理中',20,1,'gold',NULL,NULL,'2026-04-03 07:16:29','2026-04-03 07:16:29'),(42,'bug_status','FIXED','已修复',30,1,'cyan',NULL,NULL,'2026-04-03 07:16:29','2026-04-03 07:16:29'),(43,'bug_status','CLOSED','已关闭',40,1,'green',NULL,NULL,'2026-04-03 07:16:29','2026-04-03 07:16:29'),(44,'bug_status','REOPENED','重新打开',50,1,'red',NULL,NULL,'2026-04-03 07:16:29','2026-04-03 07:16:29'),(45,'bug_severity','CRITICAL','致命',10,1,'red',NULL,NULL,'2026-04-03 07:16:29','2026-04-03 07:16:29'),(46,'bug_severity','HIGH','严重',20,1,'volcano',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(47,'bug_severity','MEDIUM','一般',30,1,'gold',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(48,'bug_severity','LOW','轻微',40,1,'lime',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(49,'bug_severity','SUGGESTION','建议',50,1,'default',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(50,'bug_priority','URGENT','紧急',10,1,'red',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(51,'bug_priority','HIGH','高',20,1,'volcano',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(52,'bug_priority','MEDIUM','中',30,1,'gold',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(53,'bug_priority','LOW','低',40,1,'blue',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(54,'bug_type','FUNCTION','功能缺陷',10,1,'blue',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(55,'bug_type','UI','界面问题',20,1,'cyan',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(56,'bug_type','PERFORMANCE','性能问题',30,1,'orange',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(57,'bug_type','SECURITY','安全漏洞',40,1,'red',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(58,'bug_type','DATA','数据问题',50,1,'purple',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(59,'bug_type','OTHER','其他',60,1,'default',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(60,'bug_product','GENERAL','通用模块',10,1,'blue',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(61,'bug_stage','ANALYSIS','需求分析',10,1,'blue',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(62,'bug_stage','DESIGN','方案设计',20,1,'cyan',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(63,'bug_stage','DEVELOPMENT','开发实现',30,1,'gold',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(64,'bug_stage','TESTING','测试验证',40,1,'purple',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(65,'bug_stage','RELEASE','上线发布',50,1,'green',NULL,NULL,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(66,'project_template_phase_type','requirement','需求',10,1,NULL,'项目模板默认阶段',NULL,'2026-04-03 07:16:44','2026-04-03 07:16:44'),(67,'project_template_phase_type','plan','规划',20,1,NULL,'项目模板默认阶段',NULL,'2026-04-03 07:16:44','2026-04-03 07:16:44'),(68,'project_template_phase_type','design','方案',30,1,NULL,'项目模板默认阶段',NULL,'2026-04-03 07:16:44','2026-04-03 07:16:44'),(69,'project_template_phase_type','develop','开发',40,1,NULL,'项目模板默认阶段',NULL,'2026-04-03 07:16:44','2026-04-03 07:16:44'),(70,'project_template_phase_type','test','测试',50,1,NULL,'项目模板默认阶段',NULL,'2026-04-03 07:16:44','2026-04-03 07:16:44'),(71,'project_template_phase_type','release','发布',60,1,NULL,'项目模板默认阶段',NULL,'2026-04-03 07:16:44','2026-04-03 07:16:44'),(72,'project_template_phase_type','operate','运营',70,1,NULL,'项目模板默认阶段',NULL,'2026-04-03 07:16:44','2026-04-03 07:16:44'),(73,'demand_communication_type','MEETING_DECISION','会议结论',10,1,'blue','需求沟通记录类型',NULL,'2026-04-03 07:16:45','2026-04-03 07:16:45'),(74,'demand_communication_type','COMM_NOTE','沟通备注',20,1,'gold','需求沟通记录类型',NULL,'2026-04-03 07:16:45','2026-04-03 07:16:45'),(75,'demand_communication_type','RISK_ALERT','风险提醒',30,1,'red','需求沟通记录类型',NULL,'2026-04-03 07:16:45','2026-04-03 07:16:45'),(76,'demand_communication_type','DECISION_LOG','决策结论',40,1,'green','需求沟通记录类型',NULL,'2026-04-03 07:16:45','2026-04-03 07:16:45'),(77,'demand_participant_role','DEMAND_OWNER','需求负责人',10,1,NULL,'模板节点适配角色',NULL,'2026-04-03 07:17:08','2026-04-03 07:17:08'),(78,'demand_participant_role','PRODUCT_MANAGER','产品经理',20,1,NULL,'模板节点适配角色',NULL,'2026-04-03 07:17:08','2026-04-03 07:17:08'),(79,'demand_participant_role','DESIGNER','设计',30,1,NULL,'模板节点适配角色',NULL,'2026-04-03 07:17:08','2026-04-03 07:17:08'),(80,'demand_participant_role','FRONTEND_DEV','前端开发',40,1,NULL,'模板节点适配角色',NULL,'2026-04-03 07:17:08','2026-04-03 07:17:08'),(81,'demand_participant_role','BACKEND_DEV','后端开发',50,1,NULL,'模板节点适配角色',NULL,'2026-04-03 07:17:08','2026-04-03 07:17:08'),(82,'demand_participant_role','DEVOPS_DEV','运维开发',55,1,NULL,'模板节点适配角色',NULL,'2026-04-03 07:17:08','2026-04-03 07:17:08'),(83,'demand_participant_role','BIGDATA_DEV','大数据开发',60,1,NULL,'模板节点适配角色',NULL,'2026-04-03 07:17:08','2026-04-03 07:17:08'),(84,'demand_participant_role','ALGORITHM_DEV','算法开发',70,1,NULL,'模板节点适配角色',NULL,'2026-04-03 07:17:09','2026-04-03 07:17:09'),(85,'demand_participant_role','QA','测试',80,1,NULL,'模板节点适配角色',NULL,'2026-04-03 07:17:09','2026-04-03 07:17:09'),(86,'demand_participant_role','OPERATIONS','运营',90,1,NULL,'模板节点适配角色',NULL,'2026-04-03 07:17:09','2026-04-03 07:17:09'),(87,'demand_participant_role','MEDIA_BUYER','投放',100,1,NULL,'模板节点适配角色',NULL,'2026-04-03 07:17:09','2026-04-03 07:17:09'),(88,'job_level','T1','T1',10,1,'default','职级初始化项',NULL,'2026-04-03 07:17:09','2026-04-03 07:17:09'),(89,'job_level','T2','T2',20,1,'blue','职级初始化项',NULL,'2026-04-03 07:17:09','2026-04-03 07:17:09'),(90,'job_level','T3','T3',30,1,'cyan','职级初始化项',NULL,'2026-04-03 07:17:09','2026-04-03 07:17:09'),(91,'job_level','T4','T4',40,1,'gold','职级初始化项',NULL,'2026-04-03 07:17:09','2026-04-03 07:17:09'),(92,'job_level','T5','T5',50,1,'orange','职级初始化项',NULL,'2026-04-03 07:17:09','2026-04-03 07:17:09'),(93,'job_level','T6','T6',60,1,'red','职级初始化项',NULL,'2026-04-03 07:17:09','2026-04-03 07:17:09'),(94,'task_difficulty','N1','N1',10,1,'green','任务难度',NULL,'2026-04-03 07:17:10','2026-04-03 07:17:10'),(95,'task_difficulty','N2','N2',20,1,'blue','任务难度',NULL,'2026-04-03 07:17:10','2026-04-03 07:17:10'),(96,'task_difficulty','N3','N3',30,1,'orange','任务难度',NULL,'2026-04-03 07:17:10','2026-04-03 07:17:10'),(97,'task_difficulty','N4','N4',40,1,'red','任务难度',NULL,'2026-04-03 07:17:10','2026-04-03 07:17:10');
/*!40000 ALTER TABLE `config_dict_items` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `config_dict_types`
--

LOCK TABLES `config_dict_types` WRITE;
/*!40000 ALTER TABLE `config_dict_types` DISABLE KEYS */;
INSERT INTO `config_dict_types` VALUES (1,'user_status','用户状态','用户可用状态枚举',1,0,'2026-03-19 11:08:44','2026-03-20 01:15:20'),(3,'issue_type','事项类型','工作记录事项类型',1,0,'2026-03-20 07:28:08','2026-03-20 07:45:58'),(5,'demand_phase_type','需求任务','用于工作台、日志、报表等需求任务阶段配置',1,1,'2026-03-20 08:14:20','2026-04-03 07:16:44'),(7,'business_group','业务组','业务分组维度',1,1,'2026-03-20 16:20:05','2026-03-20 16:20:05'),(8,'business_line','业务线',NULL,1,0,'2026-03-24 06:25:46','2026-03-24 06:25:46'),(9,'bug_status','Bug状态','Bug状态字典',1,1,'2026-04-03 07:16:29','2026-04-03 07:16:29'),(10,'bug_severity','Bug严重程度','Bug严重程度字典',1,1,'2026-04-03 07:16:29','2026-04-03 07:16:29'),(11,'bug_priority','Bug优先级','Bug优先级字典',1,1,'2026-04-03 07:16:29','2026-04-03 07:16:29'),(12,'bug_type','Bug类型','Bug类型字典',1,1,'2026-04-03 07:16:29','2026-04-03 07:16:29'),(13,'bug_product','Bug产品模块','Bug产品模块字典',1,1,'2026-04-03 07:16:29','2026-04-03 07:16:29'),(14,'bug_stage','Bug阶段','Bug阶段字典',1,1,'2026-04-03 07:16:30','2026-04-03 07:16:30'),(15,'project_template_phase_type','需求阶段','用于项目模板与项目管理流程节点的阶段配置',1,1,'2026-04-03 07:16:44','2026-04-03 07:16:44'),(16,'demand_communication_type','需求沟通记录类型','用于需求详情页沟通记录、会议结论、风险提醒与决策记录分类',1,1,'2026-04-03 07:16:45','2026-04-03 07:16:45'),(17,'demand_participant_role','需求参与角色','用于项目模板节点适配与需求流程初始化裁剪的业务参与角色配置',1,1,'2026-04-03 07:17:08','2026-04-03 07:17:08'),(18,'job_level','职级','用户职级字典，用于人效分析与用户信息维护',1,1,'2026-04-03 07:17:09','2026-04-03 07:17:09'),(19,'task_difficulty','任务难度','Owner 内部维护的任务难度分级，仅用于事项 Owner 评估维护',1,1,'2026-04-03 07:17:10','2026-04-03 07:17:10');
/*!40000 ALTER TABLE `config_dict_types` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `departments`
--

LOCK TABLES `departments` WRITE;
/*!40000 ALTER TABLE `departments` DISABLE KEYS */;
INSERT INTO `departments` VALUES (1,'Wegic业务线',NULL,27,10,1,'2026-03-24 06:22:18','2026-03-24 06:22:18'),(2,'A1业务线',NULL,28,20,1,'2026-03-24 06:22:18','2026-03-24 06:22:18'),(3,'项目管理办公室',NULL,26,30,1,'2026-03-24 06:22:18','2026-03-24 06:22:18');
/*!40000 ALTER TABLE `departments` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='效能系数配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `efficiency_factor_settings`
--

LOCK TABLES `efficiency_factor_settings` WRITE;
/*!40000 ALTER TABLE `efficiency_factor_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `efficiency_factor_settings` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `menu_visibility_rules`
--

LOCK TABLES `menu_visibility_rules` WRITE;
/*!40000 ALTER TABLE `menu_visibility_rules` DISABLE KEYS */;
INSERT INTO `menu_visibility_rules` VALUES ('/departments','ROLE',NULL,NULL,'[\"SUPER_ADMIN\"]','2026-03-26 08:07:52'),('/dict-center','ROLE',NULL,NULL,'[\"SUPER_ADMIN\"]','2026-03-26 08:07:53'),('/efficiency/demand','ROLE',NULL,NULL,'[\"SUPER_ADMIN\", \"BUSINESS_LINE_ADMIN\", \"ADMIN\"]','2026-03-26 08:07:52'),('/efficiency/member','ROLE',NULL,NULL,'[\"SUPER_ADMIN\"]','2026-03-26 08:07:52'),('/menu-visibility','ROLE',NULL,NULL,'[\"SUPER_ADMIN\"]','2026-03-26 08:07:52'),('/options','ROLE',NULL,NULL,'[\"SUPER_ADMIN\"]','2026-03-26 08:07:52'),('/pm/workflow-templates','ROLE',NULL,NULL,'[\"SUPER_ADMIN\", \"BUSINESS_LINE_ADMIN\", \"ADMIN\"]','2026-03-26 08:07:52'),('/role-permissions','ROLE',NULL,NULL,'[\"SUPER_ADMIN\"]','2026-03-26 08:07:52'),('/user-departments','ROLE',NULL,NULL,'[\"SUPER_ADMIN\", \"BUSINESS_LINE_ADMIN\"]','2026-03-26 08:07:52'),('/users','ROLE',NULL,NULL,'[\"SUPER_ADMIN\"]','2026-03-26 08:07:52'),('project-management','ROLE',NULL,NULL,'[\"SUPER_ADMIN\", \"ADMIN\"]','2026-03-24 06:22:18');
/*!40000 ALTER TABLE `menu_visibility_rules` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='节点状态变更日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `node_status_logs`
--

LOCK TABLES `node_status_logs` WRITE;
/*!40000 ALTER TABLE `node_status_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `node_status_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_config`
--

LOCK TABLES `notification_config` WRITE;
/*!40000 ALTER TABLE `notification_config` DISABLE KEYS */;
INSERT INTO `notification_config` VALUES (1,'node_assign',1,'[\"node_assignee\"]',0,'2026-04-03 15:16:17','2026-04-03 15:16:17'),(2,'node_reject',1,'[\"node_assignee\"]',0,'2026-04-03 15:16:17','2026-04-03 15:16:17'),(3,'task_assign',1,'[\"task_assignee\"]',0,'2026-04-03 15:16:17','2026-04-03 15:16:17'),(4,'task_deadline',1,'[\"task_assignee\"]',1,'2026-04-03 15:16:17','2026-04-03 15:16:17'),(5,'task_complete',1,'[\"task_creator\"]',0,'2026-04-03 15:16:17','2026-04-03 15:16:17'),(6,'node_complete',1,'[\"project_manager\"]',0,'2026-04-03 15:16:17','2026-04-03 15:16:17'),(7,'bug_assign',1,'[\"bug_assignee\"]',0,'2026-04-03 15:16:30','2026-04-03 15:16:30'),(8,'bug_status_change',1,'[\"bug_reporter\"]',0,'2026-04-03 15:16:30','2026-04-03 15:16:30'),(9,'bug_fixed',1,'[\"bug_reporter\"]',0,'2026-04-03 15:16:30','2026-04-03 15:16:30'),(10,'bug_reopen',1,'[\"bug_assignee\"]',0,'2026-04-03 15:16:30','2026-04-03 15:16:30');
/*!40000 ALTER TABLE `notification_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_logs`
--

DROP TABLE IF EXISTS `notification_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `notification_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '关联规则ID',
  `receiver_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '接收人用户ID（可为0）',
  `channel` varchar(16) NOT NULL DEFAULT 'FEISHU' COMMENT '渠道 FEISHU/IN_APP',
  `attempt_no` int unsigned NOT NULL DEFAULT '1' COMMENT '重试次数',
  `status` varchar(16) NOT NULL DEFAULT 'SUCCESS' COMMENT '发送状态 SUCCESS/FAILED/SKIPPED',
  `error_message` varchar(1000) DEFAULT NULL COMMENT '错误信息',
  `request_payload` json DEFAULT NULL COMMENT '请求报文',
  `response_payload` json DEFAULT NULL COMMENT '响应报文',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_notification_logs_notification_id` (`notification_id`),
  KEY `idx_notification_logs_status_created` (`status`,`created_at`),
  KEY `idx_notification_logs_receiver_id` (`receiver_id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知发送日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_logs`
--

LOCK TABLES `notification_logs` WRITE;
/*!40000 ALTER TABLE `notification_logs` DISABLE KEYS */;
INSERT INTO `notification_logs` VALUES (1,1,0,'FEISHU',1,'FAILED','未找到可发送接收人（缺少用户 open_id 或接收配置）','{\"data\": {\"bug_id\": 10001, \"bug_no\": \"BUG-10001\", \"event_id\": \"evt_1775203198721\", \"priority\": \"P1\", \"severity\": \"high\", \"trace_id\": \"trace_1775203198721\", \"bug_title\": \"登录后偶发白屏\", \"bug_status\": \"待处理\", \"bug_content\": \"用户点击“工作台”后页面偶发白屏，需要刷新恢复。\", \"assignee_name\": \"张三\", \"reporter_name\": \"李四\"}, \"receiver\": \"{}\", \"event_type\": \"bug_assign\"}','{\"results\": [], \"target_count\": 0, \"failure_count\": 0, \"success_count\": 0}','2026-04-03 07:59:58'),(2,1,0,'FEISHU',1,'FAILED','缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET 配置','{\"data\": {\"bug_id\": 1, \"bug_no\": \"BUG0001\", \"status\": \"新建\", \"priority\": \"紧急\", \"severity\": \"致命\", \"bug_title\": \"123\", \"demand_id\": null, \"assignee_id\": 26, \"bug_content\": \"123\", \"demand_name\": \"\", \"operator_id\": 26, \"reporter_id\": 26, \"assignee_name\": \"项目管理员\", \"operator_name\": \"projectmanger\", \"reporter_name\": \"项目管理员\", \"to_assignee_id\": 26, \"business_line_id\": null, \"from_assignee_id\": null, \"to_assignee_name\": \"项目管理员\", \"from_assignee_name\": \"\"}, \"receiver\": \"{}\", \"event_type\": \"bug_assign\"}','{}','2026-04-03 08:00:44'),(3,1,0,'FEISHU',1,'FAILED','未找到可发送接收人（缺少用户 open_id 或接收配置）','{\"data\": {\"bug_id\": 1, \"bug_no\": \"BUG0001\", \"status\": \"新建\", \"priority\": \"紧急\", \"severity\": \"致命\", \"bug_title\": \"123\", \"demand_id\": null, \"assignee_id\": 31, \"bug_content\": \"123\", \"demand_name\": \"\", \"operator_id\": 26, \"reporter_id\": 26, \"assignee_name\": \"pm_super_wegic\", \"operator_name\": \"projectmanger\", \"reporter_name\": \"项目管理员\", \"to_assignee_id\": 31, \"business_line_id\": null, \"from_assignee_id\": 26, \"to_assignee_name\": \"pm_super_wegic\", \"from_assignee_name\": \"项目管理员\"}, \"receiver\": \"{}\", \"event_type\": \"bug_assign\"}','{\"results\": [], \"target_count\": 0, \"failure_count\": 0, \"success_count\": 0}','2026-04-03 08:00:55'),(4,1,0,'FEISHU',1,'FAILED','缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET 配置','{\"data\": {\"bug_id\": 1, \"bug_no\": \"BUG0001\", \"status\": \"新建\", \"priority\": \"紧急\", \"severity\": \"致命\", \"bug_title\": \"123\", \"demand_id\": null, \"assignee_id\": 26, \"bug_content\": \"123\", \"demand_name\": \"\", \"operator_id\": 26, \"reporter_id\": 26, \"assignee_name\": \"项目管理员\", \"operator_name\": \"projectmanger\", \"reporter_name\": \"项目管理员\", \"to_assignee_id\": 26, \"business_line_id\": null, \"from_assignee_id\": 31, \"to_assignee_name\": \"项目管理员\", \"from_assignee_name\": \"pm_super_wegic\"}, \"receiver\": \"{}\", \"event_type\": \"bug_assign\"}','{}','2026-04-03 08:01:06'),(5,1,0,'FEISHU',1,'FAILED','未找到可发送接收人（缺少用户 open_id 或接收配置）','{\"data\": {\"bug_id\": 10001, \"bug_no\": \"BUG-10001\", \"event_id\": \"evt_1775203317753\", \"priority\": \"P1\", \"severity\": \"high\", \"trace_id\": \"trace_1775203317753\", \"bug_title\": \"登录后偶发白屏\", \"bug_status\": \"待处理\", \"bug_content\": \"用户点击“工作台”后页面偶发白屏，需要刷新恢复。\", \"assignee_name\": \"张三\", \"reporter_name\": \"李四\"}, \"receiver\": \"{}\", \"event_type\": \"bug_assign\"}','{\"results\": [], \"target_count\": 0, \"failure_count\": 0, \"success_count\": 0}','2026-04-03 08:01:57'),(6,1,0,'FEISHU',1,'FAILED','缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET 配置','{\"data\": {\"bug_id\": 10001, \"bug_no\": \"BUG-10001\", \"event_id\": \"evt_1775203330888\", \"priority\": \"P1\", \"severity\": \"high\", \"trace_id\": \"trace_1775203330888\", \"bug_title\": \"登录后偶发白屏\", \"bug_status\": \"待处理\", \"bug_content\": \"用户点击“工作台”后页面偶发白屏，需要刷新恢复。\", \"assignee_name\": \"张三\", \"reporter_name\": \"李四\"}, \"receiver\": \"{}\", \"event_type\": \"bug_assign\"}','{}','2026-04-03 08:02:11'),(7,1,0,'FEISHU',1,'FAILED','缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET 配置','{\"data\": {\"bug_id\": 10001, \"bug_no\": \"BUG-10001\", \"event_id\": \"evt_1775204255792\", \"priority\": \"P1\", \"severity\": \"high\", \"trace_id\": \"trace_1775204255792\", \"bug_title\": \"登录后偶发白屏\", \"bug_status\": \"待处理\", \"bug_content\": \"用户点击“工作台”后页面偶发白屏，需要刷新恢复。\", \"assignee_name\": \"张三\", \"reporter_name\": \"李四\"}, \"receiver\": \"{}\", \"event_type\": \"bug_assign\"}','{}','2026-04-03 08:17:36'),(8,2,0,'FEISHU',1,'SKIPPED','当前为 shadow 模式，仅记录日志不发送','{\"data\": {\"node_id\": 321, \"event_id\": \"evt_1775530830263\", \"trace_id\": \"trace_1775530830263\", \"demand_id\": \"D-2026-001\", \"node_name\": \"测试节点\", \"demand_name\": \"通知中心测试需求\", \"operator_id\": 1, \"assignee_name\": \"测试用户\", \"operator_name\": \"管理员\"}, \"target\": {\"target_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"target_name\": null, \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{}','2026-04-07 03:00:30'),(9,2,0,'FEISHU',1,'SKIPPED','当前为 shadow 模式，仅记录日志不发送','{\"data\": {\"node_id\": 321, \"event_id\": \"evt_1775530834869\", \"trace_id\": \"trace_1775530834869\", \"demand_id\": \"D-2026-001\", \"node_name\": \"测试节点\", \"demand_name\": \"通知中心测试需求\", \"operator_id\": 1, \"assignee_name\": \"测试用户\", \"operator_name\": \"管理员\"}, \"target\": {\"target_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"target_name\": null, \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{}','2026-04-07 03:00:35'),(10,2,0,'FEISHU',1,'SUCCESS',NULL,'{\"data\": {\"node_id\": 321, \"event_id\": \"evt_1775531017603\", \"trace_id\": \"trace_1775531017603\", \"demand_id\": \"D-2026-001\", \"node_name\": \"测试节点\", \"demand_name\": \"通知中心测试需求\", \"operator_id\": 1, \"assignee_name\": \"测试用户\", \"operator_name\": \"管理员\"}, \"target\": {\"target_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"target_name\": null, \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{\"body\": {\"msg\": \"success\", \"code\": 0, \"data\": {\"body\": {\"content\": \"{\\\"title\\\":\\\"节点完成通知\\\",\\\"elements\\\":[[{\\\"tag\\\":\\\"text\\\",\\\"text\\\":\\\"测试节点 完成了！！\\\"}]]}\"}, \"sender\": {\"id\": \"cli_a941975ec9f6dbef\", \"id_type\": \"app_id\", \"tenant_key\": \"2e1b7466090f5658\", \"sender_type\": \"app\"}, \"chat_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"deleted\": false, \"updated\": false, \"msg_type\": \"interactive\", \"message_id\": \"om_x100b52730e52e8acb28c96e1e8b7b69\", \"create_time\": \"1775531018237\", \"update_time\": \"1775531018237\"}}, \"http_status\": 200}','2026-04-07 03:03:38'),(11,2,0,'FEISHU',1,'SKIPPED','当前为 shadow 模式，仅记录日志不发送','{\"data\": {\"status\": \"DONE\", \"node_id\": 108, \"node_key\": \"NODE_1\", \"demand_id\": \"REQ955\", \"node_name\": \"产品方案\", \"assignee_id\": 26, \"demand_name\": \"测试需求\", \"operator_id\": 26, \"to_node_key\": \"NODE_2\", \"assignee_name\": \"项目管理员\", \"from_node_key\": \"NODE_1\", \"operator_name\": \"projectmanger\", \"business_line_id\": null}, \"target\": {\"target_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"target_name\": \"测试需求\", \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{}','2026-04-07 03:58:42'),(12,2,0,'FEISHU',1,'SUCCESS',NULL,'{\"data\": {\"status\": \"DONE\", \"node_id\": 109, \"node_key\": \"NODE_2\", \"demand_id\": \"REQ955\", \"node_name\": \"评审\", \"assignee_id\": 26, \"demand_name\": \"测试需求\", \"operator_id\": 26, \"to_node_key\": \"NODE_3\", \"assignee_name\": \"项目管理员\", \"from_node_key\": \"NODE_2\", \"operator_name\": \"projectmanger\", \"business_line_id\": null}, \"target\": {\"target_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"target_name\": \"测试需求\", \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{\"body\": {\"msg\": \"success\", \"code\": 0, \"data\": {\"body\": {\"content\": \"{\\\"title\\\":\\\"节点完成通知\\\",\\\"elements\\\":[[{\\\"tag\\\":\\\"text\\\",\\\"text\\\":\\\"评审 完成了！！\\\"}]]}\"}, \"sender\": {\"id\": \"cli_a941975ec9f6dbef\", \"id_type\": \"app_id\", \"tenant_key\": \"2e1b7466090f5658\", \"sender_type\": \"app\"}, \"chat_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"deleted\": false, \"updated\": false, \"msg_type\": \"interactive\", \"message_id\": \"om_x100b527c5d7ff13cb3bcc0ce8b8dcb7\", \"create_time\": \"1775534395360\", \"update_time\": \"1775534395360\"}}, \"http_status\": 200}','2026-04-07 03:59:55'),(13,2,0,'FEISHU',1,'SUCCESS',NULL,'{\"data\": {\"status\": \"DONE\", \"node_id\": 110, \"node_key\": \"NODE_3\", \"demand_id\": \"REQ955\", \"node_name\": \"开发\", \"assignee_id\": 26, \"demand_name\": \"测试需求\", \"operator_id\": 26, \"to_node_key\": \"NODE_4\", \"assignee_name\": \"项目管理员\", \"from_node_key\": \"NODE_3\", \"operator_name\": \"projectmanger\", \"business_line_id\": null}, \"target\": {\"target_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"target_name\": \"测试需求\", \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{\"body\": {\"msg\": \"success\", \"code\": 0, \"data\": {\"body\": {\"content\": \"{\\\"title\\\":\\\"节点完成通知\\\",\\\"elements\\\":[[{\\\"tag\\\":\\\"text\\\",\\\"text\\\":\\\"开发 完成了！！\\\"}]]}\"}, \"sender\": {\"id\": \"cli_a941975ec9f6dbef\", \"id_type\": \"app_id\", \"tenant_key\": \"2e1b7466090f5658\", \"sender_type\": \"app\"}, \"chat_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"deleted\": false, \"updated\": false, \"msg_type\": \"interactive\", \"message_id\": \"om_x100b527c5ac9a8f4b2e8a9b8154ff96\", \"create_time\": \"1775534400478\", \"update_time\": \"1775534400478\"}}, \"http_status\": 200}','2026-04-07 04:00:00'),(14,2,0,'FEISHU',1,'SUCCESS',NULL,'{\"data\": {\"status\": \"DONE\", \"node_id\": 111, \"node_key\": \"NODE_4\", \"demand_id\": \"REQ955\", \"node_name\": \"测试\", \"assignee_id\": 26, \"demand_name\": \"测试需求\", \"operator_id\": 26, \"to_node_key\": \"NODE_5\", \"assignee_name\": \"项目管理员\", \"from_node_key\": \"NODE_4\", \"operator_name\": \"projectmanger\", \"business_line_id\": null}, \"target\": {\"target_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"target_name\": \"测试需求\", \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{\"body\": {\"msg\": \"success\", \"code\": 0, \"data\": {\"body\": {\"content\": \"{\\\"title\\\":\\\"节点完成通知\\\",\\\"elements\\\":[[{\\\"tag\\\":\\\"text\\\",\\\"text\\\":\\\"测试 完成了！！\\\"}]]}\"}, \"sender\": {\"id\": \"cli_a941975ec9f6dbef\", \"id_type\": \"app_id\", \"tenant_key\": \"2e1b7466090f5658\", \"sender_type\": \"app\"}, \"chat_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"deleted\": false, \"updated\": false, \"msg_type\": \"interactive\", \"message_id\": \"om_x100b527c5aad90a4b22e46fb1981bbd\", \"create_time\": \"1775534406212\", \"update_time\": \"1775534406212\"}}, \"http_status\": 200}','2026-04-07 04:00:06'),(15,2,0,'FEISHU',1,'SUCCESS',NULL,'{\"data\": {\"status\": \"DONE\", \"node_id\": 112, \"node_key\": \"NODE_5\", \"demand_id\": \"REQ955\", \"node_name\": \"上线\", \"assignee_id\": 26, \"demand_name\": \"测试需求\", \"operator_id\": 26, \"to_node_key\": \"\", \"assignee_name\": \"项目管理员\", \"from_node_key\": \"NODE_5\", \"operator_name\": \"projectmanger\", \"business_line_id\": null}, \"target\": {\"target_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"target_name\": \"测试需求\", \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{\"body\": {\"msg\": \"success\", \"code\": 0, \"data\": {\"body\": {\"content\": \"{\\\"title\\\":\\\"节点完成通知\\\",\\\"elements\\\":[[{\\\"tag\\\":\\\"text\\\",\\\"text\\\":\\\"上线 完成了！！\\\"}]]}\"}, \"sender\": {\"id\": \"cli_a941975ec9f6dbef\", \"id_type\": \"app_id\", \"tenant_key\": \"2e1b7466090f5658\", \"sender_type\": \"app\"}, \"chat_id\": \"oc_3ecfc76acfbbfc91f09a7686e19fbb25\", \"deleted\": false, \"updated\": false, \"msg_type\": \"interactive\", \"message_id\": \"om_x100b527c5a5840b8b255841a6b6ce8d\", \"create_time\": \"1775534409583\", \"update_time\": \"1775534409583\"}}, \"http_status\": 200}','2026-04-07 04:00:09'),(16,2,0,'FEISHU',1,'SKIPPED','当前为 shadow 模式，仅记录日志不发送','{\"data\": {\"status\": \"DONE\", \"node_id\": 128, \"node_key\": \"NODE_1\", \"demand_id\": \"REQ959\", \"node_name\": \"产品方案\", \"assignee_id\": null, \"demand_name\": \"自动拉群，且拉指定人员，以及通知测试需求\", \"operator_id\": 26, \"to_node_key\": \"NODE_2\", \"assignee_name\": \"\", \"from_node_key\": \"NODE_1\", \"operator_name\": \"projectmanger\", \"business_line_id\": null}, \"target\": {\"target_id\": \"oc_03d2f1c0454602f5e6c7d0c4b0f51cbe\", \"target_name\": \"自动拉群，且拉指定人员，以及通知测试需求\", \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{}','2026-04-07 07:15:03'),(17,2,0,'FEISHU',1,'SUCCESS',NULL,'{\"data\": {\"status\": \"DONE\", \"node_id\": 129, \"node_key\": \"NODE_2\", \"demand_id\": \"REQ959\", \"node_name\": \"评审\", \"assignee_id\": null, \"demand_name\": \"自动拉群，且拉指定人员，以及通知测试需求\", \"operator_id\": 26, \"to_node_key\": \"NODE_3\", \"assignee_name\": \"\", \"from_node_key\": \"NODE_2\", \"operator_name\": \"projectmanger\", \"business_line_id\": null}, \"target\": {\"target_id\": \"oc_03d2f1c0454602f5e6c7d0c4b0f51cbe\", \"target_name\": \"自动拉群，且拉指定人员，以及通知测试需求\", \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{\"body\": {\"msg\": \"success\", \"code\": 0, \"data\": {\"body\": {\"content\": \"{\\\"title\\\":\\\"节点完成通知\\\",\\\"elements\\\":[[{\\\"tag\\\":\\\"text\\\",\\\"text\\\":\\\"评审 完成了！！\\\"}]]}\"}, \"sender\": {\"id\": \"cli_a941975ec9f6dbef\", \"id_type\": \"app_id\", \"tenant_key\": \"2e1b7466090f5658\", \"sender_type\": \"app\"}, \"chat_id\": \"oc_03d2f1c0454602f5e6c7d0c4b0f51cbe\", \"deleted\": false, \"updated\": false, \"msg_type\": \"interactive\", \"message_id\": \"om_x100b527eb3b430a4b2f6a9104a778a8\", \"create_time\": \"1775546327833\", \"update_time\": \"1775546327833\"}}, \"http_status\": 200}','2026-04-07 07:18:47'),(18,2,0,'FEISHU',1,'SUCCESS',NULL,'{\"data\": {\"status\": \"DONE\", \"node_id\": 130, \"node_key\": \"NODE_3\", \"demand_id\": \"REQ959\", \"node_name\": \"开发\", \"assignee_id\": null, \"demand_name\": \"自动拉群，且拉指定人员，以及通知测试需求\", \"operator_id\": 26, \"to_node_key\": \"NODE_4\", \"assignee_name\": \"\", \"from_node_key\": \"NODE_3\", \"operator_name\": \"projectmanger\", \"business_line_id\": null}, \"target\": {\"target_id\": \"oc_03d2f1c0454602f5e6c7d0c4b0f51cbe\", \"target_name\": \"自动拉群，且拉指定人员，以及通知测试需求\", \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{\"body\": {\"msg\": \"success\", \"code\": 0, \"data\": {\"body\": {\"content\": \"{\\\"title\\\":\\\"节点完成通知\\\",\\\"elements\\\":[[{\\\"tag\\\":\\\"text\\\",\\\"text\\\":\\\"开发 完成了！！\\\"}]]}\"}, \"sender\": {\"id\": \"cli_a941975ec9f6dbef\", \"id_type\": \"app_id\", \"tenant_key\": \"2e1b7466090f5658\", \"sender_type\": \"app\"}, \"chat_id\": \"oc_03d2f1c0454602f5e6c7d0c4b0f51cbe\", \"deleted\": false, \"updated\": false, \"msg_type\": \"interactive\", \"message_id\": \"om_x100b527eb36e3880b27e47057cebcba\", \"create_time\": \"1775546330459\", \"update_time\": \"1775546330459\"}}, \"http_status\": 200}','2026-04-07 07:18:50'),(19,2,0,'FEISHU',1,'SUCCESS',NULL,'{\"data\": {\"status\": \"DONE\", \"node_id\": 131, \"node_key\": \"NODE_4\", \"demand_id\": \"REQ959\", \"node_name\": \"测试\", \"assignee_id\": null, \"demand_name\": \"自动拉群，且拉指定人员，以及通知测试需求\", \"operator_id\": 26, \"to_node_key\": \"NODE_5\", \"assignee_name\": \"\", \"from_node_key\": \"NODE_4\", \"operator_name\": \"projectmanger\", \"business_line_id\": null}, \"target\": {\"target_id\": \"oc_03d2f1c0454602f5e6c7d0c4b0f51cbe\", \"target_name\": \"自动拉群，且拉指定人员，以及通知测试需求\", \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{\"body\": {\"msg\": \"success\", \"code\": 0, \"data\": {\"body\": {\"content\": \"{\\\"title\\\":\\\"节点完成通知\\\",\\\"elements\\\":[[{\\\"tag\\\":\\\"text\\\",\\\"text\\\":\\\"测试 完成了！！\\\"}]]}\"}, \"sender\": {\"id\": \"cli_a941975ec9f6dbef\", \"id_type\": \"app_id\", \"tenant_key\": \"2e1b7466090f5658\", \"sender_type\": \"app\"}, \"chat_id\": \"oc_03d2f1c0454602f5e6c7d0c4b0f51cbe\", \"deleted\": false, \"updated\": false, \"msg_type\": \"interactive\", \"message_id\": \"om_x100b527eb37344b4b24a2252c526351\", \"create_time\": \"1775546332167\", \"update_time\": \"1775546332167\"}}, \"http_status\": 200}','2026-04-07 07:18:52'),(20,2,0,'FEISHU',1,'SUCCESS',NULL,'{\"data\": {\"status\": \"DONE\", \"node_id\": 132, \"node_key\": \"NODE_5\", \"demand_id\": \"REQ959\", \"node_name\": \"上线\", \"assignee_id\": null, \"demand_name\": \"自动拉群，且拉指定人员，以及通知测试需求\", \"operator_id\": 26, \"to_node_key\": \"\", \"assignee_name\": \"\", \"from_node_key\": \"NODE_5\", \"operator_name\": \"projectmanger\", \"business_line_id\": null}, \"target\": {\"target_id\": \"oc_03d2f1c0454602f5e6c7d0c4b0f51cbe\", \"target_name\": \"自动拉群，且拉指定人员，以及通知测试需求\", \"target_type\": \"chat\"}, \"event_type\": \"node_complete\"}','{\"body\": {\"msg\": \"success\", \"code\": 0, \"data\": {\"body\": {\"content\": \"{\\\"title\\\":\\\"节点完成通知\\\",\\\"elements\\\":[[{\\\"tag\\\":\\\"text\\\",\\\"text\\\":\\\"上线 完成了！！\\\"}]]}\"}, \"sender\": {\"id\": \"cli_a941975ec9f6dbef\", \"id_type\": \"app_id\", \"tenant_key\": \"2e1b7466090f5658\", \"sender_type\": \"app\"}, \"chat_id\": \"oc_03d2f1c0454602f5e6c7d0c4b0f51cbe\", \"deleted\": false, \"updated\": false, \"msg_type\": \"interactive\", \"message_id\": \"om_x100b527eb3112c80b311c5e5e712e52\", \"create_time\": \"1775546334028\", \"update_time\": \"1775546334028\"}}, \"http_status\": 200}','2026-04-07 07:18:54');
/*!40000 ALTER TABLE `notification_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_rule_receivers`
--

DROP TABLE IF EXISTS `notification_rule_receivers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_rule_receivers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `rule_id` bigint unsigned NOT NULL COMMENT '规则ID',
  `receiver_type` varchar(16) NOT NULL COMMENT '接收人类型 ROLE/USER/DEPT/DYNAMIC',
  `receiver_value` varchar(255) NOT NULL COMMENT '接收值（ID或路径）',
  `receiver_label` varchar(255) DEFAULT NULL COMMENT '展示名称',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_notification_rule_receivers_rule_enabled` (`rule_id`,`enabled`),
  KEY `idx_notification_rule_receivers_type_value` (`receiver_type`,`receiver_value`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知规则接收人';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_rule_receivers`
--

LOCK TABLES `notification_rule_receivers` WRITE;
/*!40000 ALTER TABLE `notification_rule_receivers` DISABLE KEYS */;
INSERT INTO `notification_rule_receivers` VALUES (2,1,'USER','26','项目管理员 (projectmanger)',1,'2026-04-03 08:02:09','2026-04-03 08:02:09'),(6,2,'DYNAMIC','__demand_bound_chat__','需求绑定群',1,'2026-04-07 03:58:32','2026-04-07 03:58:32');
/*!40000 ALTER TABLE `notification_rule_receivers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_rules`
--

DROP TABLE IF EXISTS `notification_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_rules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `rule_code` varchar(64) NOT NULL COMMENT '规则编码',
  `rule_name` varchar(128) NOT NULL COMMENT '规则名称',
  `biz_domain` varchar(64) NOT NULL DEFAULT 'default' COMMENT '业务域',
  `biz_line_id` bigint unsigned NOT NULL DEFAULT '0' COMMENT '业务线ID，0表示全局',
  `event_type` varchar(64) NOT NULL COMMENT '触发事件类型',
  `template_id` bigint unsigned DEFAULT NULL COMMENT '模板ID（兼容字段）',
  `message_title` varchar(255) DEFAULT NULL COMMENT '规则通知标题模板',
  `message_content` text COMMENT '规则通知内容模板',
  `channels_json` json DEFAULT NULL COMMENT '发送渠道配置JSON',
  `frequency` varchar(16) NOT NULL DEFAULT 'IMMEDIATE' COMMENT '发送频率',
  `trigger_condition_type` varchar(16) NOT NULL DEFAULT 'ALWAYS' COMMENT '触发条件类型',
  `trigger_condition_json` json DEFAULT NULL COMMENT '触发条件JSON',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_by` bigint DEFAULT NULL COMMENT '创建人ID',
  `updated_by` bigint DEFAULT NULL COMMENT '更新人ID',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_rules_code` (`rule_code`),
  KEY `idx_notification_rules_event_type` (`event_type`),
  KEY `idx_notification_rules_biz_line` (`biz_line_id`),
  KEY `idx_notification_rules_event_enabled` (`event_type`,`enabled`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知规则（兼容版）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_rules`
--

LOCK TABLES `notification_rules` WRITE;
/*!40000 ALTER TABLE `notification_rules` DISABLE KEYS */;
INSERT INTO `notification_rules` VALUES (1,'n_rule_bug_assign_mnim1nyh_8c7y4s','bug指派','default',0,'bug_assign',NULL,'你有新的BUG','${bug_title} 指派给你了','[\"FEISHU\"]','IMMEDIATE','ALWAYS','null',1,26,26,'2026-04-03 07:57:04','2026-04-03 08:02:09'),(2,'n_rule_node_complete_mno17jnz_gu7191','节点完成','default',0,'node_complete',NULL,'节点完成通知','${node_name} 完成了！！','[\"FEISHU\"]','IMMEDIATE','ALWAYS','null',1,26,26,'2026-04-07 03:00:23','2026-04-07 03:58:32'),(3,'n_rule_node_reject_mnoct22o_96spej','周报','default',0,'node_reject',NULL,NULL,'11','[\"FEISHU\"]','IMMEDIATE','ALWAYS','null',1,26,26,'2026-04-07 08:25:03','2026-04-07 08:25:45');
/*!40000 ALTER TABLE `notification_rules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_templates`
--

DROP TABLE IF EXISTS `notification_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_templates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `template_code` varchar(64) NOT NULL COMMENT '模板编码',
  `template_name` varchar(128) NOT NULL COMMENT '模板名称',
  `title_template` varchar(255) DEFAULT NULL COMMENT '标题模板',
  `content_template` text COMMENT '内容模板',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_by` bigint DEFAULT NULL COMMENT '创建人ID',
  `updated_by` bigint DEFAULT NULL COMMENT '更新人ID',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_templates_code` (`template_code`),
  KEY `idx_notification_templates_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知模板';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_templates`
--

LOCK TABLES `notification_templates` WRITE;
/*!40000 ALTER TABLE `notification_templates` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification_templates` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `notification_trigger_cursor`
--

LOCK TABLES `notification_trigger_cursor` WRITE;
/*!40000 ALTER TABLE `notification_trigger_cursor` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification_trigger_cursor` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=60 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permissions`
--

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` VALUES (1,'project.view','查看业务线','project_management',1,'查看业务线','查看业务线'),(2,'project.create','创建业务线','project_management',1,'创建业务线','创建业务线'),(3,'project.edit','编辑业务线','project_management',1,'编辑业务线','编辑业务线'),(4,'project.delete','删除业务线','project_management',1,'删除业务线','删除业务线'),(5,'project.member.manage','管理业务线成员','project_management',1,'管理业务线成员','管理业务线成员'),(6,'requirement.view','查看需求','project_management',1,'查看需求','查看需求'),(7,'requirement.create','创建需求','project_management',1,'创建需求','创建需求'),(8,'requirement.edit','编辑需求','project_management',1,'编辑需求','编辑需求'),(9,'requirement.transition','流转需求状态','project_management',1,'流转需求状态','流转需求状态'),(10,'bug.view','查看缺陷','project_management',1,'查看缺陷','查看缺陷'),(11,'bug.create','创建缺陷','project_management',1,'创建缺陷','创建缺陷'),(12,'bug.edit','编辑缺陷','project_management',1,'编辑缺陷','编辑缺陷'),(13,'bug.transition','流转缺陷状态','project_management',1,'流转缺陷状态','流转缺陷状态'),(14,'project.stats.view','查看业务线统计','project_management',1,'查看业务线统计','查看业务线统计'),(15,'business_line.switch','切换业务线','project_management',1,'切换业务线','切换当前业务线上下文'),(16,'demand.workflow.template.view','查看流程模板','project_management',1,'查看流程模板','查看业务线流程模板'),(17,'demand.workflow.template.edit','编辑流程模板','project_management',1,'编辑流程模板','编辑业务线流程模板'),(18,'demand.workflow.template.publish','发布流程模板','project_management',1,'发布流程模板','发布业务线流程模板版本'),(19,'demand.workflow.instance.transition','流转需求流程','project_management',1,'流转需求流程','推进需求流程节点'),(20,'demand.view','查看需求池','project_management',1,'demand.view','查看需求池'),(22,'demand.transfer_owner','转交需求负责人','project_management',1,'demand.transfer_owner','转交需求负责人'),(23,'demand.workflow.view','查看需求流程','project_management',1,'demand.workflow.view','查看需求流程'),(25,'demand.manage','管理需求池','project_management',1,'demand.manage','管理需求池'),(26,'demand.workflow.manage','管理需求流程','project_management',1,'demand.workflow.manage','管理需求流程'),(34,'worklog.view.self','查看个人日志','work_management',1,'worklog.view.self','查看个人日志'),(35,'worklog.create','创建工作日志','work_management',1,'worklog.create','创建工作日志'),(36,'worklog.update.self','修改个人日志','work_management',1,'worklog.update.self','修改个人日志'),(37,'worklog.view.team','查看团队日志','work_management',1,'worklog.view.team','查看团队日志'),(38,'workbench.view.self','查看个人工作台','work_management',1,'workbench.view.self','查看个人工作台'),(39,'workbench.view.owner','查看Owner工作台','work_management',1,'workbench.view.owner','查看Owner工作台'),(40,'user.view','查看用户','user',1,'查看用户','查看用户'),(41,'user.create','创建用户','user',1,'创建用户','创建用户'),(42,'user.update','更新用户','user',1,'更新用户','更新用户'),(43,'user.delete','删除用户','user',1,'删除用户','删除用户'),(44,'option.view','查看系统选项','option',1,'查看系统选项','查看系统选项'),(45,'option.manage','管理系统选项','option',1,'管理系统选项','管理系统选项'),(46,'dict.view','查看字典中心','dict',1,'查看字典中心','查看字典中心'),(47,'dict.manage','管理字典中心','dict',1,'管理字典中心','管理字典中心'),(48,'dept.view','查看组织架构','dept',1,'查看组织架构','查看组织架构'),(49,'dept.manage','管理组织架构','dept',1,'管理组织架构','管理组织架构'),(50,'archive.view','查看归档管理','archive',1,'archive.view','查看归档管理'),(51,'archive.manage','管理归档删除','archive',1,'archive.manage','管理归档删除'),(52,'project.template.view','查看项目模板','work',1,NULL,NULL),(53,'project.template.manage','管理项目模板','work',1,NULL,NULL),(54,'notification.config.view','查看通知配置','work',1,NULL,NULL),(55,'notification.config.manage','管理通知配置','work',1,NULL,NULL),(56,'bug.update','编辑Bug','work',1,NULL,NULL),(57,'bug.manage','管理Bug','work',1,NULL,NULL),(58,'bug.delete','删除Bug','work',1,NULL,NULL),(59,'demand.create','新建需求','work',1,NULL,NULL);
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pm_activity_logs`
--

LOCK TABLES `pm_activity_logs` WRITE;
/*!40000 ALTER TABLE `pm_activity_logs` DISABLE KEYS */;
INSERT INTO `pm_activity_logs` VALUES (1,1,NULL,NULL,'PROJECT',1,'CREATE','创建项目：Staging项目管理冒烟验证',26,'2026-03-23 11:49:12'),(2,1,1,NULL,'REQUIREMENT',1,'CREATE','创建需求：Staging 需求冒烟验证',26,'2026-03-23 11:49:12'),(3,1,1,1,'BUG',1,'CREATE','创建 Bug：Staging-Bug 冒烟验证',26,'2026-03-23 11:49:12'),(4,1,1,1,'BUG',1,'DELETE','删除 Bug：Staging-Bug 冒烟验证',26,'2026-03-23 11:49:12'),(5,1,1,NULL,'REQUIREMENT',1,'DELETE','删除需求：Staging 需求冒烟验证',26,'2026-03-23 11:49:12'),(6,1,NULL,NULL,'PROJECT',1,'DELETE','删除项目：Staging项目管理冒烟验证',26,'2026-03-23 11:49:12'),(7,2,NULL,NULL,'PROJECT',2,'CREATE','创建项目：Staging统计功能验证',26,'2026-03-24 01:30:32'),(8,2,2,NULL,'REQUIREMENT',2,'CREATE','创建需求：统计需求样例A',26,'2026-03-24 01:30:32'),(9,2,3,NULL,'REQUIREMENT',3,'CREATE','创建需求：统计需求样例B',26,'2026-03-24 01:30:32'),(10,2,2,2,'BUG',2,'CREATE','创建 Bug：统计BugA',26,'2026-03-24 01:30:32'),(11,2,3,3,'BUG',3,'CREATE','创建 Bug：统计BugB',26,'2026-03-24 01:30:32'),(12,2,2,2,'BUG',2,'DELETE','删除 Bug：统计BugA',26,'2026-03-24 01:30:33'),(13,2,3,3,'BUG',3,'DELETE','删除 Bug：统计BugB',26,'2026-03-24 01:30:33'),(14,2,2,NULL,'REQUIREMENT',2,'DELETE','删除需求：统计需求样例A',26,'2026-03-24 01:30:33'),(15,2,3,NULL,'REQUIREMENT',3,'DELETE','删除需求：统计需求样例B',26,'2026-03-24 01:30:33'),(16,2,NULL,NULL,'PROJECT',2,'DELETE','删除项目：Staging统计功能验证',26,'2026-03-24 01:30:33'),(17,3,NULL,NULL,'PROJECT',3,'CREATE','创建项目：北新商城项目管理升级',26,'2026-03-24 02:18:50'),(18,4,NULL,NULL,'PROJECT',4,'CREATE','创建项目：供应链协同平台优化',26,'2026-03-24 02:18:51'),(19,5,NULL,NULL,'PROJECT',5,'CREATE','创建项目：门店运营后台收尾',26,'2026-03-24 02:18:51'),(20,3,NULL,NULL,'PROJECT',3,'ADD_MEMBER','添加项目成员：projectmanger（PM）',26,'2026-03-24 02:18:51'),(21,4,NULL,NULL,'PROJECT',4,'ADD_MEMBER','添加项目成员：projectmanger（PM）',26,'2026-03-24 02:18:51'),(22,3,4,NULL,'REQUIREMENT',4,'CREATE','创建需求：搭建项目总览页',26,'2026-03-24 02:18:51'),(23,3,5,NULL,'REQUIREMENT',5,'CREATE','创建需求：需求管理支持负责人指派',26,'2026-03-24 02:18:51'),(24,4,6,NULL,'REQUIREMENT',6,'CREATE','创建需求：补充项目统计接口',26,'2026-03-24 02:18:51'),(25,5,7,NULL,'REQUIREMENT',7,'CREATE','创建需求：收尾上线验收',26,'2026-03-24 02:18:51'),(26,3,NULL,4,'BUG',4,'CREATE','创建 Bug：项目总览卡片数据不刷新',26,'2026-03-24 02:18:52'),(27,3,NULL,5,'BUG',5,'CREATE','创建 Bug：需求创建后负责人显示为空',26,'2026-03-24 02:18:52'),(28,4,NULL,6,'BUG',6,'CREATE','创建 Bug：成员统计口径未包含 Bug 工时',26,'2026-03-24 02:18:52'),(29,5,NULL,7,'BUG',7,'CREATE','创建 Bug：已完成项目仍显示进行中标签',26,'2026-03-24 02:18:52'),(30,3,NULL,10,'BUG',10,'CREATE','Test data activity log',37,'2026-03-26 06:58:43'),(31,3,NULL,11,'BUG',11,'CREATE','Test data activity log',33,'2026-03-26 06:58:43'),(32,4,NULL,12,'BUG',12,'CREATE','Test data activity log',38,'2026-03-26 06:58:43'),(33,4,NULL,13,'BUG',13,'CREATE','Test data activity log',34,'2026-03-26 06:58:43');
/*!40000 ALTER TABLE `pm_activity_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pm_bugs`
--

LOCK TABLES `pm_bugs` WRITE;
/*!40000 ALTER TABLE `pm_bugs` DISABLE KEYS */;
INSERT INTO `pm_bugs` VALUES (1,NULL,1,1,NULL,'Staging-Bug 冒烟验证','用于验证 Bug 的创建与查询。','1. 打开页面 2. 提交表单','HIGH','OPEN','DEVELOPMENT',26,2.00,0.00,'2026-03-24',NULL,NULL,NULL,1,26,26,'2026-03-23 11:49:12','2026-03-24 02:26:41'),(2,NULL,2,2,NULL,'统计BugA','统计 Bug A 样例。','1. 进入统计页面','HIGH','OPEN','DEVELOPMENT',26,3.00,1.50,'2026-03-25',NULL,NULL,NULL,1,26,26,'2026-03-24 01:30:32','2026-03-24 02:26:41'),(3,NULL,2,3,NULL,'统计BugB','统计 Bug B 样例。','1. 进入统计页面','MEDIUM','FIXING','TEST',26,2.00,1.00,'2026-03-26',NULL,NULL,NULL,1,26,26,'2026-03-24 01:30:32','2026-03-24 02:26:41'),(4,'BUG004',3,NULL,'REQ901','项目总览卡片数据不刷新','切换项目后卡片数据仍为上一个项目。','1.进入项目中心 2.切换项目 3.观察统计卡片','HIGH','FIXING','DEVELOPMENT',26,4.00,1.50,'2026-03-25',NULL,NULL,NULL,0,26,26,'2026-03-24 02:18:52','2026-03-25 02:04:14'),(5,'BUG005',3,NULL,NULL,'需求创建后负责人显示为空','创建需求时已填写负责人，但列表页没有正确显示。','1.新建需求 2.填写负责人 3.保存后查看列表','MEDIUM','OPEN','TEST',26,2.00,0.50,'2026-03-26',NULL,NULL,NULL,0,26,26,'2026-03-24 02:18:52','2026-03-25 02:04:14'),(6,'BUG006',4,NULL,NULL,'成员统计口径未包含 Bug 工时','按成员统计时缺少 Bug 实际工时。','1.进入项目统计 2.查看成员视图','CRITICAL','VERIFIED','RELEASE',26,6.00,6.00,'2026-03-24','2026-03-24 10:18:52','2026-03-24 10:18:52',NULL,0,26,26,'2026-03-24 02:18:52','2026-03-25 02:04:14'),(7,NULL,5,NULL,NULL,'已完成项目仍显示进行中标签','已完成项目在列表上状态颜色错误。','1.打开项目中心 2.查看已完成项目状态','LOW','CLOSED','RELEASE',26,1.00,1.00,'2026-03-09','2026-03-24 10:18:52','2026-03-24 10:18:52','2026-03-24 10:18:52',1,26,26,'2026-03-24 02:18:52','2026-03-24 02:47:43'),(8,'BUG008',4,NULL,'REQ904','A1 分页查询总数不准确','有筛选条件时总数统计不正确。','1.设置筛选 2.观察总数','MEDIUM','OPEN','DEVELOPMENT',28,3.00,0.00,'2026-04-11',NULL,NULL,NULL,0,26,26,'2026-03-24 03:16:00','2026-03-25 02:04:14'),(9,'BUG009',3,NULL,NULL,'Wegic 列表筛选后滑动位置丢失','表格筛选后横向滚动位置重置。','1.滚动表格 2.执行筛选','LOW','FIXING','TEST',27,2.00,1.00,'2026-04-09',NULL,NULL,NULL,0,26,26,'2026-03-24 03:16:00','2026-03-25 02:04:14'),(10,'BUG951',3,NULL,'REQ951','Wegic Login Button Occasionally Fails','Wegic bug test description','1. Open page 2. Trigger action 3. Observe result','MEDIUM','OPEN','DEVELOPMENT',37,6.00,2.00,'2026-03-26',NULL,NULL,NULL,0,37,37,'2026-03-26 06:58:43','2026-03-26 07:08:50'),(11,'BUG952',3,NULL,'REQ952','Wegic Demand Detail Loads Slowly','Wegic bug test description','1. Open page 2. Trigger action 3. Observe result','HIGH','FIXING','DEVELOPMENT',33,6.00,2.00,'2026-03-26',NULL,NULL,NULL,0,33,33,'2026-03-26 06:58:43','2026-03-26 07:08:50'),(12,'BUG953',4,NULL,'REQ953','A1 Board Pagination Breaks After Filter','A1 bug test description','1. Open page 2. Trigger action 3. Observe result','MEDIUM','OPEN','TEST',38,6.00,2.00,'2026-03-26',NULL,NULL,NULL,0,38,38,'2026-03-26 06:58:43','2026-03-26 07:08:50'),(13,'BUG954',4,NULL,'REQ954','A1 Bug Detail Log Rendering Error','A1 bug test description','1. Open page 2. Trigger action 3. Observe result','HIGH','FIXING','DEVELOPMENT',34,6.00,2.00,'2026-03-26',NULL,NULL,NULL,0,34,34,'2026-03-26 06:58:43','2026-03-26 07:08:50');
/*!40000 ALTER TABLE `pm_bugs` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pm_project_members`
--

LOCK TABLES `pm_project_members` WRITE;
/*!40000 ALTER TABLE `pm_project_members` DISABLE KEYS */;
INSERT INTO `pm_project_members` VALUES (1,3,26,'PM',0,'2026-03-24 02:18:51',26,26,'2026-03-24 02:18:51','2026-03-24 02:18:51'),(2,4,26,'PM',0,'2026-03-24 02:18:51',26,26,'2026-03-24 02:18:51','2026-03-24 02:18:51'),(3,3,27,'DEV',0,'2026-03-24 03:09:34',26,26,'2026-03-24 03:09:34','2026-03-24 03:09:34'),(4,4,28,'DEV',0,'2026-03-24 03:09:34',26,26,'2026-03-24 03:09:34','2026-03-24 03:09:34');
/*!40000 ALTER TABLE `pm_project_members` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pm_projects`
--

LOCK TABLES `pm_projects` WRITE;
/*!40000 ALTER TABLE `pm_projects` DISABLE KEYS */;
INSERT INTO `pm_projects` VALUES (1,'Staging项目管理冒烟验证','STAGING-PM-SMOKE-20260323','用于 staging 环境项目管理模块冒烟验证。','IN_PROGRESS',26,'2026-03-23','2026-03-31',1,26,26,'2026-03-23 11:49:12','2026-03-24 02:26:41'),(2,'Staging统计功能验证','STAGING-STATS-20260324','用于 staging 环境统计接口与工时汇总验证。','IN_PROGRESS',26,'2026-03-24','2026-03-31',1,26,26,'2026-03-24 01:30:32','2026-03-24 02:26:41'),(3,'Wegic','WEGIC','Wegic business line project','IN_PROGRESS',26,'2026-03-20','2026-04-30',0,26,26,'2026-03-24 02:18:50','2026-03-26 07:08:50'),(4,'A1','A1','A1 business line project','IN_PROGRESS',26,'2026-03-18','2026-05-15',0,26,26,'2026-03-24 02:18:51','2026-03-26 07:08:50'),(5,'门店运营后台收尾','PM-STAGE-003','用于展示已完成项目。','COMPLETED',26,'2026-02-01','2026-03-10',1,26,26,'2026-03-24 02:18:51','2026-03-24 02:47:43');
/*!40000 ALTER TABLE `pm_projects` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pm_requirements`
--

LOCK TABLES `pm_requirements` WRITE;
/*!40000 ALTER TABLE `pm_requirements` DISABLE KEYS */;
INSERT INTO `pm_requirements` VALUES (1,1,'Staging 需求冒烟验证','用于验证需求的创建、查询和状态流转。','HIGH','TODO','REQUIREMENT',26,5.00,0.00,'2026-03-23','2026-03-28',NULL,1,26,26,'2026-03-23 11:49:12','2026-03-24 02:26:41'),(2,2,'统计需求样例A','统计功能的 A 类需求样例。','HIGH','TODO','REQUIREMENT',26,8.00,5.00,'2026-03-24','2026-03-28',NULL,1,26,26,'2026-03-24 01:30:32','2026-03-24 02:26:41'),(3,2,'统计需求样例B','统计功能的 B 类需求样例。','MEDIUM','IN_PROGRESS','DEVELOPMENT',26,4.00,2.00,'2026-03-24','2026-03-29',NULL,1,26,26,'2026-03-24 01:30:32','2026-03-24 02:26:41'),(4,3,'搭建项目总览页','展示项目概况、成员、需求和缺陷统计。','HIGH','IN_PROGRESS','DEVELOPMENT',26,16.00,9.00,'2026-03-21','2026-03-28',NULL,0,26,26,'2026-03-24 02:18:51','2026-03-24 02:22:40'),(5,3,'需求管理支持负责人指派','支持创建需求后快速指派负责人。','URGENT','TODO','REQUIREMENT',26,8.00,1.00,'2026-03-24','2026-03-27',NULL,0,26,26,'2026-03-24 02:18:51','2026-03-24 02:22:40'),(6,4,'补充项目统计接口','按项目和成员维度统计工时与人天。','HIGH','DONE','RELEASE',26,12.00,13.00,'2026-03-19','2026-03-23',NULL,0,26,26,'2026-03-24 02:18:51','2026-03-24 02:22:40'),(7,5,'收尾上线验收','完成发布前验收和问题闭环。','MEDIUM','DONE','RELEASE',26,6.00,5.50,'2026-03-01','2026-03-08',NULL,1,26,26,'2026-03-24 02:18:51','2026-03-24 02:47:43'),(8,4,'A1 统计报表导出优化','优化业务线统计报表导出性能。','MEDIUM','TODO','REQUIREMENT',28,6.00,0.00,NULL,'2026-04-10',NULL,0,26,26,'2026-03-24 03:16:00','2026-03-24 03:16:00'),(9,3,'Wegic 元数据列表筛选增强','增加组合筛选与搜索能力。','HIGH','IN_PROGRESS','DEVELOPMENT',27,10.00,3.00,NULL,'2026-04-12',NULL,0,26,26,'2026-03-24 03:16:00','2026-03-24 03:16:00');
/*!40000 ALTER TABLE `pm_requirements` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pm_user_business_lines`
--

LOCK TABLES `pm_user_business_lines` WRITE;
/*!40000 ALTER TABLE `pm_user_business_lines` DISABLE KEYS */;
INSERT INTO `pm_user_business_lines` VALUES (1,27,3,26,26,'2026-03-24 03:09:34','2026-03-24 03:09:34'),(2,28,4,26,26,'2026-03-24 03:09:34','2026-03-24 03:09:34'),(3,30,4,NULL,NULL,'2026-03-26 06:07:51','2026-03-26 06:07:51'),(4,31,3,31,31,'2026-03-26 06:56:48','2026-03-26 06:56:48'),(5,32,4,32,32,'2026-03-26 06:56:48','2026-03-26 06:56:48'),(6,33,3,33,33,'2026-03-26 06:56:48','2026-03-26 06:56:48'),(7,34,4,34,34,'2026-03-26 06:56:48','2026-03-26 06:56:48'),(8,35,3,35,35,'2026-03-26 06:56:48','2026-03-26 06:56:48'),(9,36,4,36,36,'2026-03-26 06:56:48','2026-03-26 06:56:48'),(10,37,3,37,37,'2026-03-26 06:56:48','2026-03-26 06:56:48'),(11,38,4,38,38,'2026-03-26 06:56:48','2026-03-26 06:56:48');
/*!40000 ALTER TABLE `pm_user_business_lines` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pm_workflow_instance_nodes`
--

LOCK TABLES `pm_workflow_instance_nodes` WRITE;
/*!40000 ALTER TABLE `pm_workflow_instance_nodes` DISABLE KEYS */;
INSERT INTO `pm_workflow_instance_nodes` VALUES (1,1,'FANGAN','产品方案',10,'DONE',NULL,NULL,NULL,'2026-03-25 17:21:34','2026-03-25 09:10:48','2026-03-25 10:36:44'),(2,1,'UIDESIGN','UI设计',20,'DONE',NULL,NULL,'2026-03-25 17:21:34','2026-03-25 17:21:43','2026-03-25 09:10:48','2026-03-26 10:01:24'),(3,1,'DEVELOPMENT','开发',30,'IN_PROGRESS',NULL,NULL,'2026-03-25 17:21:43',NULL,'2026-03-25 09:10:48','2026-03-26 10:01:24'),(4,1,'TEST','测试',40,'PENDING',NULL,NULL,'2026-03-25 17:21:54',NULL,'2026-03-25 09:10:48','2026-03-25 10:36:44'),(5,1,'PUSH','上线',50,'PENDING',NULL,NULL,NULL,NULL,'2026-03-25 09:10:48','2026-03-25 10:36:44'),(6,2,'FANGAN','产品方案',10,'DONE',NULL,NULL,NULL,'2026-03-25 18:54:28','2026-03-25 10:47:32','2026-03-25 10:54:28'),(7,2,'UIDESIGN','UI设计',20,'DONE',NULL,NULL,'2026-03-25 18:54:28','2026-03-25 18:54:30','2026-03-25 10:47:32','2026-03-25 10:54:30'),(8,2,'DEVELOPMENTFANAN','开发方案',30,'DONE',NULL,NULL,'2026-03-25 18:54:30','2026-03-25 18:54:32','2026-03-25 10:47:32','2026-03-25 10:54:32'),(9,2,'DEVELOPMENT','开发',40,'IN_PROGRESS',NULL,NULL,'2026-03-25 18:54:32',NULL,'2026-03-25 10:47:32','2026-03-25 10:54:32'),(10,2,'TESTYONGLI','测试用例',50,'PENDING',NULL,NULL,NULL,NULL,'2026-03-25 10:47:32','2026-03-25 10:47:32'),(11,2,'TEST','测试',60,'PENDING',NULL,NULL,NULL,NULL,'2026-03-25 10:47:32','2026-03-25 10:47:32'),(12,2,'SHANGXIAN','上线',70,'PENDING',NULL,NULL,NULL,NULL,'2026-03-25 10:47:32','2026-03-25 10:47:32');
/*!40000 ALTER TABLE `pm_workflow_instance_nodes` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pm_workflow_instances`
--

LOCK TABLES `pm_workflow_instances` WRITE;
/*!40000 ALTER TABLE `pm_workflow_instances` DISABLE KEYS */;
INSERT INTO `pm_workflow_instances` VALUES (1,'REQ907',3,1,1,'DEVELOPMENT','IN_PROGRESS','2026-03-25 17:10:48',NULL,1,37,'2026-03-25 09:10:48','2026-03-26 10:01:24'),(2,'REQ908',4,2,1,'DEVELOPMENT','IN_PROGRESS','2026-03-25 18:47:32',NULL,26,26,'2026-03-25 10:47:32','2026-03-25 10:54:32');
/*!40000 ALTER TABLE `pm_workflow_instances` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pm_workflow_operation_logs`
--

LOCK TABLES `pm_workflow_operation_logs` WRITE;
/*!40000 ALTER TABLE `pm_workflow_operation_logs` DISABLE KEYS */;
INSERT INTO `pm_workflow_operation_logs` VALUES (1,3,26,'TEMPLATE',1,'CREATE','创建流程模板草稿','2026-03-25 09:02:57'),(2,3,26,'TEMPLATE',1,'UPDATE_NODES','更新流程节点，共 1 个','2026-03-25 09:04:27'),(3,3,26,'TEMPLATE',1,'UPDATE_NODES','更新流程节点，共 5 个','2026-03-25 09:05:39'),(4,3,26,'TEMPLATE',1,'UPDATE_NODES','更新流程节点，共 5 个','2026-03-25 09:06:08'),(5,3,26,'TEMPLATE',1,'PUBLISH','发布流程模板','2026-03-25 09:06:12'),(6,3,26,'INSTANCE',1,'TRANSITION_FORWARD','transition_to_UIDESIGN','2026-03-25 09:21:34'),(7,3,26,'INSTANCE',1,'TRANSITION_FORWARD','transition_to_DEVELOPMENT','2026-03-25 09:21:43'),(8,3,26,'INSTANCE',1,'TRANSITION_FORWARD','transition_to_TEST','2026-03-25 09:21:55'),(9,3,26,'INSTANCE',1,'TRANSITION_RETURN','transition_to_DEVELOPMENT','2026-03-25 10:36:40'),(10,3,26,'INSTANCE',1,'TRANSITION_RETURN','transition_to_UIDESIGN','2026-03-25 10:36:44'),(11,4,26,'TEMPLATE',2,'CREATE','创建流程模板草稿','2026-03-25 10:42:35'),(12,4,26,'TEMPLATE',2,'UPDATE_NODES','更新流程节点，共 7 个','2026-03-25 10:43:47'),(13,4,26,'TEMPLATE',2,'PUBLISH','发布流程模板','2026-03-25 10:43:49'),(14,4,26,'TEMPLATE',2,'SET_DEFAULT','设为默认流程模板','2026-03-25 10:43:51'),(15,4,26,'INSTANCE',2,'TRANSITION_FORWARD','transition_to_UIDESIGN','2026-03-25 10:54:28'),(16,4,26,'INSTANCE',2,'TRANSITION_FORWARD','transition_to_DEVELOPMENTFANAN','2026-03-25 10:54:30'),(17,4,26,'INSTANCE',2,'TRANSITION_FORWARD','transition_to_DEVELOPMENT','2026-03-25 10:54:32'),(18,3,37,'INSTANCE',1,'TRANSITION_FORWARD','transition_to_DEVELOPMENT','2026-03-26 10:01:24');
/*!40000 ALTER TABLE `pm_workflow_operation_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pm_workflow_template_nodes`
--

LOCK TABLES `pm_workflow_template_nodes` WRITE;
/*!40000 ALTER TABLE `pm_workflow_template_nodes` DISABLE KEYS */;
INSERT INTO `pm_workflow_template_nodes` VALUES (7,1,'FANGAN','产品方案',10,1,'[]','2026-03-25 09:06:07','2026-03-25 09:06:07'),(8,1,'UIDESIGN','UI设计',20,1,'[\"FANGAN\"]','2026-03-25 09:06:07','2026-03-25 09:06:07'),(9,1,'DEVELOPMENT','开发',30,1,'[\"UIDESIGN\"]','2026-03-25 09:06:07','2026-03-25 09:06:07'),(10,1,'TEST','测试',40,1,'[\"DEVELOPMENT\"]','2026-03-25 09:06:07','2026-03-25 09:06:07'),(11,1,'PUSH','上线',50,1,'[\"TEST\"]','2026-03-25 09:06:07','2026-03-25 09:06:07'),(12,2,'FANGAN','产品方案',10,1,'[]','2026-03-25 10:43:47','2026-03-25 10:43:47'),(13,2,'UIDESIGN','UI设计',20,1,'[]','2026-03-25 10:43:47','2026-03-25 10:43:47'),(14,2,'DEVELOPMENTFANAN','开发方案',30,1,'[]','2026-03-25 10:43:47','2026-03-25 10:43:47'),(15,2,'DEVELOPMENT','开发',40,1,'[]','2026-03-25 10:43:47','2026-03-25 10:43:47'),(16,2,'TESTYONGLI','测试用例',50,1,'[]','2026-03-25 10:43:47','2026-03-25 10:43:47'),(17,2,'TEST','测试',60,1,'[]','2026-03-25 10:43:47','2026-03-25 10:43:47'),(18,2,'SHANGXIAN','上线',70,1,'[]','2026-03-25 10:43:47','2026-03-25 10:43:47');
/*!40000 ALTER TABLE `pm_workflow_template_nodes` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pm_workflow_templates`
--

LOCK TABLES `pm_workflow_templates` WRITE;
/*!40000 ALTER TABLE `pm_workflow_templates` DISABLE KEYS */;
INSERT INTO `pm_workflow_templates` (`id`, `project_id`, `template_name`, `version_no`, `status`, `is_default`, `created_by`, `updated_by`, `created_at`, `updated_at`) VALUES (1,3,'wegic',1,'PUBLISHED',1,26,1,'2026-03-25 09:02:57','2026-03-25 09:10:48'),(2,4,'A1',1,'PUBLISHED',1,26,26,'2026-03-25 10:42:35','2026-03-25 10:43:51');
/*!40000 ALTER TABLE `pm_workflow_templates` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='项目成员表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_members`
--

LOCK TABLES `project_members` WRITE;
/*!40000 ALTER TABLE `project_members` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_members` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='项目模板表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_templates`
--

LOCK TABLES `project_templates` WRITE;
/*!40000 ALTER TABLE `project_templates` DISABLE KEYS */;
INSERT INTO `project_templates` VALUES (1,'测试模版',NULL,'{\"edges\": [{\"to\": \"NODE_2\", \"from\": \"NODE_1\"}, {\"to\": \"NODE_3\", \"from\": \"NODE_2\"}, {\"to\": \"NODE_4\", \"from\": \"NODE_3\"}, {\"to\": \"NODE_5\", \"from\": \"NODE_4\"}], \"nodes\": [{\"node_key\": \"NODE_1\", \"node_name\": \"产品方案\", \"node_type\": \"EXECUTE\", \"phase_key\": \"plan\", \"sort_order\": 1, \"participant_roles\": [], \"owner_estimate_required\": true}, {\"node_key\": \"NODE_2\", \"node_name\": \"评审\", \"node_type\": \"EXECUTE\", \"phase_key\": \"requirement\", \"sort_order\": 2, \"participant_roles\": [], \"owner_estimate_required\": true}, {\"node_key\": \"NODE_3\", \"node_name\": \"开发\", \"node_type\": \"EXECUTE\", \"phase_key\": \"requirement\", \"sort_order\": 3, \"participant_roles\": [], \"owner_estimate_required\": true}, {\"node_key\": \"NODE_4\", \"node_name\": \"测试\", \"node_type\": \"EXECUTE\", \"phase_key\": \"requirement\", \"sort_order\": 4, \"participant_roles\": [], \"owner_estimate_required\": true}, {\"node_key\": \"NODE_5\", \"node_name\": \"上线\", \"node_type\": \"EXECUTE\", \"phase_key\": \"requirement\", \"sort_order\": 5, \"participant_roles\": [], \"owner_estimate_required\": true}], \"entry_node_key\": \"NODE_1\", \"schema_version\": 2}',1,'2026-04-07 11:04:36','2026-04-07 11:06:09');
/*!40000 ALTER TABLE `project_templates` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
INSERT INTO `role_permissions` VALUES (2,1),(3,1),(4,1),(2,2),(4,2),(2,3),(4,3),(2,4),(4,4),(2,5),(4,5),(2,6),(3,6),(4,6),(2,7),(3,7),(4,7),(2,8),(3,8),(4,8),(2,9),(3,9),(4,9),(1,10),(2,10),(3,10),(4,10),(1,11),(2,11),(3,11),(4,11),(2,12),(3,12),(4,12),(1,13),(2,13),(3,13),(4,13),(2,14),(3,14),(4,14),(2,15),(2,16),(3,16),(2,17),(2,18),(2,19),(3,19),(1,20),(2,20),(3,20),(5,20),(1,22),(2,22),(1,23),(2,23),(3,23),(1,25),(2,25),(3,25),(1,26),(2,26),(1,34),(2,34),(3,34),(1,35),(2,35),(3,35),(1,36),(2,36),(3,36),(1,37),(2,37),(3,37),(1,38),(2,38),(3,38),(1,39),(2,39),(1,40),(2,40),(1,41),(2,41),(1,42),(2,42),(1,43),(1,44),(2,44),(1,45),(2,45),(1,46),(2,46),(1,47),(2,47),(1,48),(2,48),(3,48),(1,49),(2,49),(1,50),(2,50),(1,51),(2,51),(1,52),(2,52),(1,53),(2,53),(1,54),(2,54),(1,55),(2,55),(1,56),(2,56),(3,56),(1,57),(2,57),(3,57),(1,58),(1,59),(2,59),(5,59);
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'超级管理员','SUPER_ADMIN',100,1,1,'拥有系统全部权限的内置角色'),(2,'管理员','ADMIN',50,1,1,'负责日常管理的内置角色'),(3,'普通成员','USER',10,1,1,'默认基础成员角色'),(4,'业务线管理员','BUSINESS_LINE_ADMIN',60,1,1,'仅可管理所属业务线数据'),(5,'产品经理','PRODUCT_MANAGER',20,1,0,NULL);
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `schema_migrations`
--

LOCK TABLES `schema_migrations` WRITE;
/*!40000 ALTER TABLE `schema_migrations` DISABLE KEYS */;
INSERT INTO `schema_migrations` VALUES (1,'20260323_001_project_management_module.sql','2026-03-23 10:54:02'),(2,'20260324_002_pm_user_business_lines.sql','2026-03-24 03:08:52'),(3,'20260324_003_bug_link_demand_pool.sql','2026-03-24 06:40:17'),(4,'20260324_004_business_line_admin_permissions.sql','2026-03-24 08:24:22'),(5,'20260324_004_bug_code.sql','2026-03-25 02:04:14'),(6,'20260325_005_workflow_template_foundation.sql','2026-03-25 08:57:36'),(7,'20260325_006_workflow_permissions_and_dict_compat.sql','2026-03-25 08:57:36'),(8,'20260326_007_project_permission_name_localization.sql','2026-03-26 09:05:04');
/*!40000 ALTER TABLE `schema_migrations` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `task_collaborators`
--

LOCK TABLES `task_collaborators` WRITE;
/*!40000 ALTER TABLE `task_collaborators` DISABLE KEYS */;
/*!40000 ALTER TABLE `task_collaborators` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户管理操作日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_change_logs`
--

LOCK TABLES `user_change_logs` WRITE;
/*!40000 ALTER TABLE `user_change_logs` DISABLE KEYS */;
INSERT INTO `user_change_logs` VALUES (1,34,'VIEW','查看详情','ADMIN',26,'项目管理员','pm_admin_a1','pm_admin_a1','查看用户详情',NULL,'{\"id\":34,\"username\":\"pm_admin_a1\",\"real_name\":\"pm_admin_a1\",\"email\":\"pm_admin_a1@test.local\",\"department_id\":1,\"department_name\":\"Wegic业务线\",\"status_code\":\"ACTIVE\",\"include_in_metrics\":1,\"role_ids\":[2],\"role_names\":[\"管理员\"]}','2026-04-07 15:07:28'),(2,34,'UPDATE','编辑用户','ADMIN',26,'项目管理员','pm_admin_a1','贝鑫','更新字段：真实姓名','{\"id\":34,\"username\":\"pm_admin_a1\",\"real_name\":\"pm_admin_a1\",\"email\":\"pm_admin_a1@test.local\",\"department_id\":1,\"department_name\":\"Wegic业务线\",\"status_code\":\"ACTIVE\",\"include_in_metrics\":1,\"role_ids\":[2],\"role_names\":[\"管理员\"]}','{\"id\":34,\"username\":\"pm_admin_a1\",\"real_name\":\"贝鑫\",\"email\":\"pm_admin_a1@test.local\",\"department_id\":1,\"department_name\":\"Wegic业务线\",\"status_code\":\"ACTIVE\",\"include_in_metrics\":1,\"role_ids\":[2],\"role_names\":[\"管理员\"]}','2026-04-07 15:07:52'),(3,33,'VIEW','查看详情','ADMIN',26,'项目管理员','pm_admin_wegic','pm_admin_wegic','查看用户详情',NULL,'{\"id\":33,\"username\":\"pm_admin_wegic\",\"real_name\":\"pm_admin_wegic\",\"email\":\"pm_admin_wegic@test.local\",\"department_id\":1,\"department_name\":\"Wegic业务线\",\"status_code\":\"ACTIVE\",\"include_in_metrics\":1,\"role_ids\":[2],\"role_names\":[\"管理员\"]}','2026-04-07 15:07:55'),(4,33,'UPDATE','编辑用户','ADMIN',26,'项目管理员','pm_admin_wegic','月博','更新字段：真实姓名','{\"id\":33,\"username\":\"pm_admin_wegic\",\"real_name\":\"pm_admin_wegic\",\"email\":\"pm_admin_wegic@test.local\",\"department_id\":1,\"department_name\":\"Wegic业务线\",\"status_code\":\"ACTIVE\",\"include_in_metrics\":1,\"role_ids\":[2],\"role_names\":[\"管理员\"]}','{\"id\":33,\"username\":\"pm_admin_wegic\",\"real_name\":\"月博\",\"email\":\"pm_admin_wegic@test.local\",\"department_id\":1,\"department_name\":\"Wegic业务线\",\"status_code\":\"ACTIVE\",\"include_in_metrics\":1,\"role_ids\":[2],\"role_names\":[\"管理员\"]}','2026-04-07 15:08:05');
/*!40000 ALTER TABLE `user_change_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `user_departments`
--

LOCK TABLES `user_departments` WRITE;
/*!40000 ALTER TABLE `user_departments` DISABLE KEYS */;
INSERT INTO `user_departments` VALUES (26,3,1,'2026-03-24 06:22:18'),(27,1,1,'2026-03-24 06:22:18'),(28,2,1,'2026-03-24 06:22:18'),(29,1,1,'2026-03-26 03:14:17'),(30,2,1,'2026-03-26 03:14:11'),(33,1,1,'2026-04-07 07:08:05'),(34,1,1,'2026-04-07 07:07:52');
/*!40000 ALTER TABLE `user_departments` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `user_preferences`
--

LOCK TABLES `user_preferences` WRITE;
/*!40000 ALTER TABLE `user_preferences` DISABLE KEYS */;
INSERT INTO `user_preferences` VALUES (26,'项目管理员','13800000001','/work-logs','datetime',1,'2026-03-24 06:22:18','2026-03-24 06:22:18'),(27,'Wegic成员','13800000027','/work-logs','date',1,'2026-03-24 06:22:18','2026-03-24 06:22:18'),(28,'A1成员','13800000028','/work-logs','datetime',1,'2026-03-24 06:22:18','2026-03-24 06:22:18');
/*!40000 ALTER TABLE `user_preferences` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `user_roles`
--

LOCK TABLES `user_roles` WRITE;
/*!40000 ALTER TABLE `user_roles` DISABLE KEYS */;
INSERT INTO `user_roles` VALUES (26,1),(31,1),(32,1),(27,2),(28,2),(33,2),(34,2),(29,3),(30,3),(37,3),(38,3),(35,4),(36,4);
/*!40000 ALTER TABLE `user_roles` ENABLE KEYS */;
UNLOCK TABLES;

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
  `feishu_open_id` varchar(128) DEFAULT NULL COMMENT 'Feishu open_id',
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
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (26,'projectmanger','项目管理员','ou_15e4fbd290ea95195c9fd8414bc60151','$2a$10$ggTmh7Zr1efyF4l8wpzbZe2i0lvHBH5/q6QYvQ/23d0avH2d2Sb0W','projectmanger@staging.local','',1,3,NULL,'ACTIVE',1,'2026-03-23 11:48:45','2026-04-07 10:19:46','2026-04-07 06:51:34',NULL),(27,'wegic_member','Wegic成员',NULL,'$2a$10$rk7Z4KSxDh357ghiM0PELOK/27QyRFZSLZaKzmYCCphS.byU.nI1q','wegic_member@staging.local',NULL,1,1,NULL,'ACTIVE',1,'2026-03-24 03:09:34','2026-03-26 11:49:54','2026-03-26 03:49:54',NULL),(28,'a1_member','A1成员',NULL,'$2a$10$jCwWPQNOPVpEjkIS9hT8vORZpP7IFbIWwaaLvu2lKpq.8g0syUI7C','a1_member@staging.local',NULL,1,2,NULL,'ACTIVE',1,'2026-03-24 03:09:34','2026-03-24 11:42:24','2026-03-24 06:22:18',NULL),(29,'wegic_ordinary','wegic普通',NULL,'$2a$10$N.p8.ENPLo5ZTVNU5sX0/uMl7CYisA3dNkQwQ853SCdPNMxPtzMFe',NULL,NULL,1,1,NULL,'ACTIVE',1,'2026-03-26 03:09:10',NULL,'2026-03-26 03:14:17',NULL),(30,'a1_ordinary','a1普通',NULL,'$2a$10$l07h1DiG388sAx2DqKe0Mu2rqI9dTtJMnT7FXeXOSYPgezVZQ3PZG',NULL,NULL,1,2,NULL,'ACTIVE',1,'2026-03-26 03:12:38','2026-03-26 14:52:18','2026-03-26 06:52:18',NULL),(31,'pm_super_wegic','pm_super_wegic',NULL,'$2a$10$HLy2HXVcrBIDLVuWVPkS9OtHJo8FmDEaEs42U9PvFDf.91SOXxdJy','pm_super_wegic@test.local',NULL,1,1,NULL,'ACTIVE',1,'2026-03-26 06:56:48','2026-03-26 16:08:15','2026-03-26 08:08:15',NULL),(32,'pm_super_a1','pm_super_a1',NULL,'$2a$10$HLy2HXVcrBIDLVuWVPkS9OtHJo8FmDEaEs42U9PvFDf.91SOXxdJy','pm_super_a1@test.local',NULL,1,1,NULL,'ACTIVE',1,'2026-03-26 06:56:48','2026-03-26 16:32:53','2026-03-26 08:32:53',NULL),(33,'pm_admin_wegic','月博','ou_3ebfcf8e5c762ac25d246a41e62a665f','$2a$10$HLy2HXVcrBIDLVuWVPkS9OtHJo8FmDEaEs42U9PvFDf.91SOXxdJy','pm_admin_wegic@test.local',NULL,1,1,NULL,'ACTIVE',1,'2026-03-26 06:56:48',NULL,'2026-04-07 07:10:01',NULL),(34,'pm_admin_a1','贝鑫','ou_53b5152a251af871d254258c99fe40fe','$2a$10$HLy2HXVcrBIDLVuWVPkS9OtHJo8FmDEaEs42U9PvFDf.91SOXxdJy','pm_admin_a1@test.local',NULL,1,1,NULL,'ACTIVE',1,'2026-03-26 06:56:48','2026-03-26 15:49:39','2026-04-07 07:10:01',NULL),(35,'pm_bla_wegic','pm_bla_wegic',NULL,'$2a$10$HLy2HXVcrBIDLVuWVPkS9OtHJo8FmDEaEs42U9PvFDf.91SOXxdJy','pm_bla_wegic@test.local',NULL,1,1,NULL,'ACTIVE',1,'2026-03-26 06:56:48',NULL,'2026-03-26 07:08:50',NULL),(36,'pm_bla_a1','pm_bla_a1',NULL,'$2a$10$HLy2HXVcrBIDLVuWVPkS9OtHJo8FmDEaEs42U9PvFDf.91SOXxdJy','pm_bla_a1@test.local',NULL,1,1,NULL,'ACTIVE',1,'2026-03-26 06:56:48','2026-03-26 15:49:39','2026-03-26 07:49:39',NULL),(37,'pm_user_wegic','pm_user_wegic',NULL,'$2a$10$HLy2HXVcrBIDLVuWVPkS9OtHJo8FmDEaEs42U9PvFDf.91SOXxdJy','pm_user_wegic@test.local',NULL,1,1,NULL,'ACTIVE',1,'2026-03-26 06:56:48','2026-03-26 18:42:35','2026-03-26 10:42:35',NULL),(38,'pm_user_a1','pm_user_a1',NULL,'$2a$10$HLy2HXVcrBIDLVuWVPkS9OtHJo8FmDEaEs42U9PvFDf.91SOXxdJy','pm_user_a1@test.local',NULL,1,1,NULL,'ACTIVE',1,'2026-03-26 06:56:48','2026-03-26 16:22:07','2026-03-26 08:22:07',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_process_actions`
--

LOCK TABLES `wf_process_actions` WRITE;
/*!40000 ALTER TABLE `wf_process_actions` DISABLE KEYS */;
INSERT INTO `wf_process_actions` VALUES (26,5,NULL,'PROCESS_INIT',NULL,'REQ_ANALYSIS',26,27,'[SEED_MOCK] 流程初始化','DEMAND',901,'2026-03-24 06:22:18'),(27,5,NULL,'NODE_COMPLETE','REQ_ANALYSIS','DEV_IMPL',26,27,'[SEED_MOCK] 进入开发阶段','DEMAND',901,'2026-03-24 06:22:18'),(28,6,NULL,'PROCESS_INIT',NULL,'REQ_ANALYSIS',26,28,'[SEED_MOCK] 流程初始化','DEMAND',904,'2026-03-24 06:22:18'),(29,6,NULL,'NODE_COMPLETE','REQ_ANALYSIS','DEV_IMPL',26,28,'[SEED_MOCK] 进入开发阶段','DEMAND',904,'2026-03-24 06:22:18'),(30,7,63,'PROCESS_INIT',NULL,'COMPETITOR_RESEARCH',26,NULL,'闇€姹傛祦绋嬪疄渚嬪凡鍒涘缓',NULL,NULL,'2026-03-24 06:24:20'),(31,7,63,'ASSIGN','COMPETITOR_RESEARCH','COMPETITOR_RESEARCH',26,28,'鍒濆鍖栬嚜鍔ㄦ寚娲剧粰闇€姹傝礋璐ｄ汉',NULL,NULL,'2026-03-24 06:24:20'),(32,8,78,'PROCESS_INIT',NULL,'COMPETITOR_RESEARCH',26,NULL,'闇€姹傛祦绋嬪疄渚嬪凡鍒涘缓',NULL,NULL,'2026-03-25 09:06:44'),(33,8,78,'ASSIGN','COMPETITOR_RESEARCH','COMPETITOR_RESEARCH',26,27,'鍒濆鍖栬嚜鍔ㄦ寚娲剧粰闇€姹傝礋璐ｄ汉',NULL,NULL,'2026-03-25 09:06:44'),(34,8,78,'ASSIGN','COMPETITOR_RESEARCH','COMPETITOR_RESEARCH',26,27,'当前节点任务已指派',NULL,NULL,'2026-03-25 09:18:19'),(35,9,93,'PROCESS_INIT',NULL,'COMPETITOR_RESEARCH',26,NULL,'需求流程实例已创建',NULL,NULL,'2026-04-03 08:22:25'),(36,10,108,'PROCESS_INIT',NULL,'NODE_1',26,NULL,'需求流程实例已创建',NULL,NULL,'2026-04-07 03:06:40'),(37,10,108,'ASSIGN','NODE_1','NODE_1',26,26,'当前激活节点任务已指派',NULL,NULL,'2026-04-07 03:48:01'),(38,10,109,'ASSIGN','NODE_2','NODE_2',26,26,'当前激活节点任务已指派',NULL,NULL,'2026-04-07 03:48:09'),(39,10,110,'ASSIGN','NODE_3','NODE_3',26,26,'当前激活节点任务已指派',NULL,NULL,'2026-04-07 03:48:11'),(40,10,111,'ASSIGN','NODE_4','NODE_4',26,26,'当前激活节点任务已指派',NULL,NULL,'2026-04-07 03:48:13'),(41,10,112,'ASSIGN','NODE_5','NODE_5',26,26,'当前激活节点任务已指派',NULL,NULL,'2026-04-07 03:48:15'),(42,10,108,'SUBMIT','NODE_1','NODE_2',26,NULL,'当前节点已提交','MANUAL',NULL,'2026-04-07 03:58:42'),(43,10,109,'SUBMIT','NODE_2','NODE_3',26,NULL,'当前节点已提交','MANUAL',NULL,'2026-04-07 03:59:54'),(44,10,110,'SUBMIT','NODE_3','NODE_4',26,NULL,'当前节点已提交','MANUAL',NULL,'2026-04-07 03:59:59'),(45,10,111,'SUBMIT','NODE_4','NODE_5',26,NULL,'当前节点已提交','MANUAL',NULL,'2026-04-07 04:00:05'),(46,10,112,'COMPLETE','NODE_5',NULL,26,NULL,'流程已完成','MANUAL',NULL,'2026-04-07 04:00:09'),(47,11,113,'PROCESS_INIT',NULL,'NODE_1',26,NULL,'需求流程实例已创建',NULL,NULL,'2026-04-07 04:07:56'),(48,12,118,'PROCESS_INIT',NULL,'NODE_1',26,NULL,'需求流程实例已创建',NULL,NULL,'2026-04-07 04:30:27'),(49,13,123,'PROCESS_INIT',NULL,'NODE_1',26,NULL,'需求流程实例已创建',NULL,NULL,'2026-04-07 07:11:07'),(50,14,128,'PROCESS_INIT',NULL,'NODE_1',26,NULL,'需求流程实例已创建',NULL,NULL,'2026-04-07 07:14:33'),(51,14,128,'SUBMIT','NODE_1','NODE_2',26,NULL,'当前节点已提交','MANUAL',NULL,'2026-04-07 07:15:03'),(52,14,129,'SUBMIT','NODE_2','NODE_3',26,NULL,'当前节点已提交','MANUAL',NULL,'2026-04-07 07:18:47'),(53,14,130,'SUBMIT','NODE_3','NODE_4',26,NULL,'当前节点已提交','MANUAL',NULL,'2026-04-07 07:18:49'),(54,14,131,'SUBMIT','NODE_4','NODE_5',26,NULL,'当前节点已提交','MANUAL',NULL,'2026-04-07 07:18:51'),(55,14,132,'COMPLETE','NODE_5',NULL,26,NULL,'流程已完成','MANUAL',NULL,'2026-04-07 07:18:53');
/*!40000 ALTER TABLE `wf_process_actions` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=133 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_process_instance_nodes`
--

LOCK TABLES `wf_process_instance_nodes` WRITE;
/*!40000 ALTER TABLE `wf_process_instance_nodes` DISABLE KEYS */;
INSERT INTO `wf_process_instance_nodes` VALUES (57,5,'REQ_ANALYSIS','需求分析','TASK','PRODUCT_SOLUTION',10,'DONE',26,'2026-03-18 09:00:00','2026-03-22 18:00:00','2026-03-27','[SEED_MOCK] 节点','2026-03-24 06:22:18','2026-03-24 06:22:18',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(58,5,'DEV_IMPL','开发实现','TASK','DEV',20,'IN_PROGRESS',27,'2026-03-18 09:00:00',NULL,'2026-03-27','[SEED_MOCK] 节点','2026-03-24 06:22:18','2026-03-24 06:22:18',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(59,5,'QA_VERIFY','测试验证','TASK','TEST',30,'TODO',26,'2026-03-18 09:00:00',NULL,'2026-03-27','[SEED_MOCK] 节点','2026-03-24 06:22:18','2026-03-24 06:22:18',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(60,6,'REQ_ANALYSIS','需求分析','TASK','PRODUCT_SOLUTION',10,'DONE',26,'2026-03-18 09:00:00','2026-03-22 18:00:00','2026-03-27','[SEED_MOCK] 节点','2026-03-24 06:22:18','2026-03-24 06:22:18',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(61,6,'DEV_IMPL','开发实现','TASK','DEV_BACK',20,'DONE',28,'2026-03-18 09:00:00','2026-03-22 18:00:00','2026-03-27','[SEED_MOCK] 节点','2026-03-24 06:22:18','2026-03-24 06:22:18',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(62,6,'QA_VERIFY','测试验证','TASK','TEST',30,'IN_PROGRESS',26,'2026-03-18 09:00:00',NULL,'2026-03-27','[SEED_MOCK] 节点','2026-03-24 06:22:18','2026-03-24 06:22:18',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(63,7,'COMPETITOR_RESEARCH','竞品调研','TASK','COMPETITOR_RESEARCH',10,'IN_PROGRESS',28,'2026-03-24 14:24:21',NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(64,7,'PRODUCT_SOLUTION','产品方案','TASK','PRODUCT_SOLUTION',20,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(65,7,'DESIGN','设计阶段','TASK','DESIGN',30,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(66,7,'DATA_ANALYSIS','数据分析','TASK','DATA_ANALYSIS',30,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(67,7,'TEST_CASE','测试用例','TASK','TEST_CASE',32,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(68,7,'PRODUCT_PLANNING','产品规划','TASK','PRODUCT_PLANNING',40,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(69,7,'PRODUCT_ACCEPTANCE','产品验收','TASK','PRODUCT_ACCEPTANCE',50,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(70,7,'TECH_SOLUTION_WEB','前端方案','TASK','TECH_SOLUTION_WEB',55,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(71,7,'TECH_SOLUTION_BACK','后端方案','TASK','TECH_SOLUTION_BACK',56,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(72,7,'DEV','前端开发','TASK','DEV',60,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(73,7,'DEV_BACK','后端开发','TASK','DEV_BACK',61,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(74,7,'TEST','测试阶段','TASK','TEST',70,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(75,7,'BUG_FIX','前端Bug修复','TASK','BUG_FIX',80,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(76,7,'BUG_FIX_BACK','后端bug修复','TASK','BUG_FIX_BACK',81,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(77,7,'RELEASE_FOLLOWUP','上线跟进','TASK','RELEASE_FOLLOWUP',90,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(78,8,'COMPETITOR_RESEARCH','竞品调研','TASK','COMPETITOR_RESEARCH',10,'IN_PROGRESS',27,'2026-03-25 17:06:43',NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:18:19',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(79,8,'PRODUCT_SOLUTION','产品方案','TASK','PRODUCT_SOLUTION',20,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(80,8,'DESIGN','设计阶段','TASK','DESIGN',30,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(81,8,'DATA_ANALYSIS','数据分析','TASK','DATA_ANALYSIS',30,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(82,8,'TEST_CASE','测试用例','TASK','TEST_CASE',32,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(83,8,'PRODUCT_PLANNING','产品规划','TASK','PRODUCT_PLANNING',40,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(84,8,'PRODUCT_ACCEPTANCE','产品验收','TASK','PRODUCT_ACCEPTANCE',50,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(85,8,'TECH_SOLUTION_WEB','前端方案','TASK','TECH_SOLUTION_WEB',55,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(86,8,'TECH_SOLUTION_BACK','后端方案','TASK','TECH_SOLUTION_BACK',56,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(87,8,'DEV','前端开发','TASK','DEV',60,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(88,8,'DEV_BACK','后端开发','TASK','DEV_BACK',61,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(89,8,'TEST','测试阶段','TASK','TEST',70,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(90,8,'BUG_FIX','前端Bug修复','TASK','BUG_FIX',80,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(91,8,'BUG_FIX_BACK','后端bug修复','TASK','BUG_FIX_BACK',81,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(92,8,'RELEASE_FOLLOWUP','上线跟进','TASK','RELEASE_FOLLOWUP',90,'TODO',NULL,NULL,NULL,NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:06:44',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(93,9,'COMPETITOR_RESEARCH','竞品调研','TASK','COMPETITOR_RESEARCH',10,'IN_PROGRESS',NULL,'2026-04-03 16:22:25',NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"COMPETITOR_RESEARCH\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"PRODUCT_SOLUTION\"],\"incoming_keys\":[]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(94,9,'PRODUCT_SOLUTION','产品方案','TASK','PRODUCT_SOLUTION',20,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"PRODUCT_SOLUTION\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"DESIGN\"],\"incoming_keys\":[\"COMPETITOR_RESEARCH\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(95,9,'DESIGN','设计阶段','TASK','DESIGN',30,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"DESIGN\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"DATA_ANALYSIS\"],\"incoming_keys\":[\"PRODUCT_SOLUTION\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(96,9,'DATA_ANALYSIS','数据分析','TASK','DATA_ANALYSIS',30,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"DATA_ANALYSIS\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"TEST_CASE\"],\"incoming_keys\":[\"DESIGN\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(97,9,'TEST_CASE','测试用例','TASK','TEST_CASE',32,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"TEST_CASE\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"PRODUCT_PLANNING\"],\"incoming_keys\":[\"DATA_ANALYSIS\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(98,9,'PRODUCT_PLANNING','产品规划','TASK','PRODUCT_PLANNING',40,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"PRODUCT_PLANNING\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"PRODUCT_ACCEPTANCE\"],\"incoming_keys\":[\"TEST_CASE\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(99,9,'PRODUCT_ACCEPTANCE','产品验收','TASK','PRODUCT_ACCEPTANCE',50,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"PRODUCT_ACCEPTANCE\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"TECH_SOLUTION_WEB\"],\"incoming_keys\":[\"PRODUCT_PLANNING\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(100,9,'TECH_SOLUTION_WEB','前端方案','TASK','TECH_SOLUTION_WEB',55,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"TECH_SOLUTION_WEB\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"TECH_SOLUTION_BACK\"],\"incoming_keys\":[\"PRODUCT_ACCEPTANCE\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(101,9,'TECH_SOLUTION_BACK','后端方案','TASK','TECH_SOLUTION_BACK',56,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"TECH_SOLUTION_BACK\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"DEV\"],\"incoming_keys\":[\"TECH_SOLUTION_WEB\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(102,9,'DEV','前端开发','TASK','DEV',60,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"DEV\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"DEV_BACK\"],\"incoming_keys\":[\"TECH_SOLUTION_BACK\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(103,9,'DEV_BACK','后端开发','TASK','DEV_BACK',61,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"DEV_BACK\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"TEST\"],\"incoming_keys\":[\"DEV\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(104,9,'TEST','测试阶段','TASK','TEST',70,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"TEST\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"BUG_FIX\"],\"incoming_keys\":[\"DEV_BACK\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(105,9,'BUG_FIX','前端Bug修复','TASK','BUG_FIX',80,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"BUG_FIX\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"BUG_FIX_BACK\"],\"incoming_keys\":[\"TEST\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(106,9,'BUG_FIX_BACK','后端bug修复','TASK','BUG_FIX_BACK',81,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"BUG_FIX_BACK\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"RELEASE_FOLLOWUP\"],\"incoming_keys\":[\"BUG_FIX\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(107,9,'RELEASE_FOLLOWUP','上线跟进','TASK','RELEASE_FOLLOWUP',90,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"TASK\",\"phase_key\":\"RELEASE_FOLLOWUP\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[],\"incoming_keys\":[\"BUG_FIX_BACK\"]}','2026-04-03 08:22:25','2026-04-03 08:22:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(108,10,'NODE_1','产品方案','EXECUTE','plan',1,'DONE',26,'2026-04-07 11:06:40','2026-04-07 11:58:42',NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"plan\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_2\"],\"incoming_keys\":[]}','2026-04-07 03:06:40','2026-04-07 03:58:42',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(109,10,'NODE_2','评审','EXECUTE','requirement',2,'DONE',26,'2026-04-07 11:48:09','2026-04-07 11:59:54',NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_3\"],\"incoming_keys\":[\"NODE_1\"]}','2026-04-07 03:06:40','2026-04-07 03:59:54',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(110,10,'NODE_3','开发','EXECUTE','requirement',3,'DONE',26,'2026-04-07 11:48:11','2026-04-07 11:59:59',NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_4\"],\"incoming_keys\":[\"NODE_2\"]}','2026-04-07 03:06:40','2026-04-07 03:59:59',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(111,10,'NODE_4','测试','EXECUTE','requirement',4,'DONE',26,'2026-04-07 11:48:13','2026-04-07 12:00:05',NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_5\"],\"incoming_keys\":[\"NODE_3\"]}','2026-04-07 03:06:40','2026-04-07 04:00:05',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(112,10,'NODE_5','上线','EXECUTE','requirement',5,'DONE',26,'2026-04-07 11:48:15','2026-04-07 12:00:09',NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[],\"incoming_keys\":[\"NODE_4\"]}','2026-04-07 03:06:40','2026-04-07 04:00:09',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(113,11,'NODE_1','产品方案','EXECUTE','plan',1,'IN_PROGRESS',NULL,'2026-04-07 12:07:56',NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"plan\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_2\"],\"incoming_keys\":[]}','2026-04-07 04:07:56','2026-04-07 04:07:56',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(114,11,'NODE_2','评审','EXECUTE','requirement',2,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_3\"],\"incoming_keys\":[\"NODE_1\"]}','2026-04-07 04:07:56','2026-04-07 04:07:56',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(115,11,'NODE_3','开发','EXECUTE','requirement',3,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_4\"],\"incoming_keys\":[\"NODE_2\"]}','2026-04-07 04:07:56','2026-04-07 04:07:56',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(116,11,'NODE_4','测试','EXECUTE','requirement',4,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_5\"],\"incoming_keys\":[\"NODE_3\"]}','2026-04-07 04:07:56','2026-04-07 04:07:56',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(117,11,'NODE_5','上线','EXECUTE','requirement',5,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[],\"incoming_keys\":[\"NODE_4\"]}','2026-04-07 04:07:56','2026-04-07 04:07:56',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(118,12,'NODE_1','产品方案','EXECUTE','plan',1,'IN_PROGRESS',NULL,'2026-04-07 12:30:27',NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"plan\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_2\"],\"incoming_keys\":[]}','2026-04-07 04:30:27','2026-04-07 04:30:27',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(119,12,'NODE_2','评审','EXECUTE','requirement',2,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_3\"],\"incoming_keys\":[\"NODE_1\"]}','2026-04-07 04:30:27','2026-04-07 04:30:27',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(120,12,'NODE_3','开发','EXECUTE','requirement',3,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_4\"],\"incoming_keys\":[\"NODE_2\"]}','2026-04-07 04:30:27','2026-04-07 04:30:27',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(121,12,'NODE_4','测试','EXECUTE','requirement',4,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_5\"],\"incoming_keys\":[\"NODE_3\"]}','2026-04-07 04:30:27','2026-04-07 04:30:27',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(122,12,'NODE_5','上线','EXECUTE','requirement',5,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[],\"incoming_keys\":[\"NODE_4\"]}','2026-04-07 04:30:27','2026-04-07 04:30:27',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(123,13,'NODE_1','产品方案','EXECUTE','plan',1,'IN_PROGRESS',NULL,'2026-04-07 15:11:07',NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"plan\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_2\"],\"incoming_keys\":[]}','2026-04-07 07:11:07','2026-04-07 07:11:07',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(124,13,'NODE_2','评审','EXECUTE','requirement',2,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_3\"],\"incoming_keys\":[\"NODE_1\"]}','2026-04-07 07:11:07','2026-04-07 07:11:07',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(125,13,'NODE_3','开发','EXECUTE','requirement',3,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_4\"],\"incoming_keys\":[\"NODE_2\"]}','2026-04-07 07:11:07','2026-04-07 07:11:07',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(126,13,'NODE_4','测试','EXECUTE','requirement',4,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_5\"],\"incoming_keys\":[\"NODE_3\"]}','2026-04-07 07:11:07','2026-04-07 07:11:07',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(127,13,'NODE_5','上线','EXECUTE','requirement',5,'TODO',NULL,NULL,NULL,NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[],\"incoming_keys\":[\"NODE_4\"]}','2026-04-07 07:11:07','2026-04-07 07:11:07',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(128,14,'NODE_1','产品方案','EXECUTE','plan',1,'DONE',NULL,'2026-04-07 15:14:33','2026-04-07 15:15:03',NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"plan\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_2\"],\"incoming_keys\":[]}','2026-04-07 07:14:33','2026-04-07 07:15:03',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(129,14,'NODE_2','评审','EXECUTE','requirement',2,'DONE',NULL,'2026-04-07 15:15:03','2026-04-07 15:18:47',NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_3\"],\"incoming_keys\":[\"NODE_1\"]}','2026-04-07 07:14:33','2026-04-07 07:18:47',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(130,14,'NODE_3','开发','EXECUTE','requirement',3,'DONE',NULL,'2026-04-07 15:18:47','2026-04-07 15:18:49',NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_4\"],\"incoming_keys\":[\"NODE_2\"]}','2026-04-07 07:14:33','2026-04-07 07:18:49',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(131,14,'NODE_4','测试','EXECUTE','requirement',4,'DONE',NULL,'2026-04-07 15:18:49','2026-04-07 15:18:51',NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[\"NODE_5\"],\"incoming_keys\":[\"NODE_3\"]}','2026-04-07 07:14:33','2026-04-07 07:18:51',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(132,14,'NODE_5','上线','EXECUTE','requirement',5,'DONE',NULL,'2026-04-07 15:18:51','2026-04-07 15:18:53',NULL,'{\"schema_version\":2,\"node_type\":\"EXECUTE\",\"phase_key\":\"requirement\",\"branch_key\":null,\"parallel_group_key\":null,\"join_rule\":\"ALL\",\"description\":\"\",\"participant_roles\":[],\"owner_estimate_required\":true,\"outgoing_keys\":[],\"incoming_keys\":[\"NODE_4\"]}','2026-04-07 07:14:33','2026-04-07 07:18:53',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `wf_process_instance_nodes` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_process_instances`
--

LOCK TABLES `wf_process_instances` WRITE;
/*!40000 ALTER TABLE `wf_process_instances` DISABLE KEYS */;
INSERT INTO `wf_process_instances` VALUES (5,'DEMAND','REQ901',2,1,'IN_PROGRESS','DEV_IMPL','2026-03-17 09:00:00',NULL,26,'2026-03-24 06:22:18','2026-03-24 06:22:18'),(6,'DEMAND','REQ904',2,1,'IN_PROGRESS','QA_VERIFY','2026-03-17 09:00:00',NULL,26,'2026-03-24 06:22:18','2026-03-24 06:22:18'),(7,'DEMAND','REQ905',3,1,'IN_PROGRESS','COMPETITOR_RESEARCH','2026-03-24 14:24:20',NULL,26,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(8,'DEMAND','REQ907',3,1,'IN_PROGRESS','COMPETITOR_RESEARCH','2026-03-25 17:06:44',NULL,26,'2026-03-25 09:06:44','2026-03-25 09:06:44'),(9,'DEMAND','REQ954',3,1,'IN_PROGRESS','COMPETITOR_RESEARCH','2026-04-03 16:22:25',NULL,26,'2026-04-03 08:22:25','2026-04-03 08:22:25'),(10,'DEMAND','REQ955',1,0,'DONE',NULL,'2026-04-07 11:06:40','2026-04-07 12:00:09',26,'2026-04-07 03:06:40','2026-04-07 04:00:09'),(11,'DEMAND','REQ956',1,0,'IN_PROGRESS','NODE_1','2026-04-07 12:07:56',NULL,26,'2026-04-07 04:07:56','2026-04-07 04:07:56'),(12,'DEMAND','REQ957',1,0,'IN_PROGRESS','NODE_1','2026-04-07 12:30:27',NULL,26,'2026-04-07 04:30:27','2026-04-07 04:30:27'),(13,'DEMAND','REQ958',1,0,'IN_PROGRESS','NODE_1','2026-04-07 15:11:07',NULL,26,'2026-04-07 07:11:07','2026-04-07 07:11:07'),(14,'DEMAND','REQ959',1,0,'DONE',NULL,'2026-04-07 15:14:33','2026-04-07 15:18:53',26,'2026-04-07 07:14:33','2026-04-07 07:18:53');
/*!40000 ALTER TABLE `wf_process_instances` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_process_tasks`
--

LOCK TABLES `wf_process_tasks` WRITE;
/*!40000 ALTER TABLE `wf_process_tasks` DISABLE KEYS */;
INSERT INTO `wf_process_tasks` VALUES (7,5,58,'[SEED_MOCK] REQ901 开发任务',27,'IN_PROGRESS','HIGH','2026-03-27','DEMAND',901,26,'2026-03-24 06:22:18','2026-03-24 06:22:18',NULL,NULL,NULL,NULL),(8,5,59,'[SEED_MOCK] REQ901 测试任务',26,'TODO','NORMAL','2026-03-27','DEMAND',901,26,'2026-03-24 06:22:18','2026-03-24 06:22:18',NULL,NULL,NULL,NULL),(9,6,61,'[SEED_MOCK] REQ904 开发任务',28,'DONE','HIGH','2026-03-27','DEMAND',904,26,'2026-03-24 06:22:18','2026-03-24 06:22:18','2026-03-23 12:00:00',NULL,NULL,NULL),(10,6,62,'[SEED_MOCK] REQ904 测试任务',26,'IN_PROGRESS','NORMAL','2026-03-27','DEMAND',904,26,'2026-03-24 06:22:18','2026-03-24 06:22:18',NULL,NULL,NULL,NULL),(11,7,63,'需求 REQ905 · 竞品调研',28,'TODO','NORMAL',NULL,'SYSTEM_INIT',63,26,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL,NULL,NULL,NULL),(12,8,78,'需求 REQ907 · 竞品调研',27,'CANCELLED','NORMAL',NULL,'SYSTEM_INIT',78,26,'2026-03-25 09:06:44','2026-03-25 09:18:19','2026-03-25 17:18:19',NULL,NULL,NULL),(13,8,78,'需求 REQ907 · 竞品调研',27,'TODO','NORMAL',NULL,'ASSIGN',78,26,'2026-03-25 09:18:19','2026-03-25 09:18:19',NULL,NULL,NULL,NULL),(14,10,109,'需求 REQ955 · 评审',26,'DONE','NORMAL',NULL,'AUTO_NEXT',NULL,26,'2026-04-07 03:58:42','2026-04-07 03:59:54','2026-04-07 11:59:54',NULL,NULL,NULL),(15,10,110,'需求 REQ955 · 开发',26,'DONE','NORMAL',NULL,'AUTO_NEXT',NULL,26,'2026-04-07 03:59:54','2026-04-07 03:59:59','2026-04-07 11:59:59',NULL,NULL,NULL),(16,10,111,'需求 REQ955 · 测试',26,'DONE','NORMAL',NULL,'AUTO_NEXT',NULL,26,'2026-04-07 03:59:59','2026-04-07 04:00:05','2026-04-07 12:00:05',NULL,NULL,NULL),(17,10,112,'需求 REQ955 · 上线',26,'DONE','NORMAL',NULL,'AUTO_NEXT',NULL,26,'2026-04-07 04:00:05','2026-04-07 04:00:08','2026-04-07 12:00:08',NULL,NULL,NULL);
/*!40000 ALTER TABLE `wf_process_tasks` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_process_template_nodes`
--

LOCK TABLES `wf_process_template_nodes` WRITE;
/*!40000 ALTER TABLE `wf_process_template_nodes` DISABLE KEYS */;
INSERT INTO `wf_process_template_nodes` VALUES (15,2,'REQ_ANALYSIS','需求分析','TASK','PRODUCT_SOLUTION',10,1,'MANUAL','{\"seed\": true}','2026-03-24 06:22:18','2026-03-24 06:22:18'),(16,2,'DEV_IMPL','开发实现','TASK','DEV_BACK',20,1,'MANUAL','{\"seed\": true}','2026-03-24 06:22:18','2026-03-24 06:22:18'),(17,2,'QA_VERIFY','测试验证','TASK','TEST',30,1,'MANUAL','{\"seed\": true}','2026-03-24 06:22:18','2026-03-24 06:22:18'),(18,3,'COMPETITOR_RESEARCH','竞品调研','TASK','COMPETITOR_RESEARCH',10,1,'DEMAND_OWNER',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(19,3,'PRODUCT_SOLUTION','产品方案','TASK','PRODUCT_SOLUTION',20,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(20,3,'DESIGN','设计阶段','TASK','DESIGN',30,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(21,3,'DATA_ANALYSIS','数据分析','TASK','DATA_ANALYSIS',30,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(22,3,'TEST_CASE','测试用例','TASK','TEST_CASE',32,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(23,3,'PRODUCT_PLANNING','产品规划','TASK','PRODUCT_PLANNING',40,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(24,3,'PRODUCT_ACCEPTANCE','产品验收','TASK','PRODUCT_ACCEPTANCE',50,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(25,3,'TECH_SOLUTION_WEB','前端方案','TASK','TECH_SOLUTION_WEB',55,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(26,3,'TECH_SOLUTION_BACK','后端方案','TASK','TECH_SOLUTION_BACK',56,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(27,3,'DEV','前端开发','TASK','DEV',60,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(28,3,'DEV_BACK','后端开发','TASK','DEV_BACK',61,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(29,3,'TEST','测试阶段','TASK','TEST',70,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(30,3,'BUG_FIX','前端Bug修复','TASK','BUG_FIX',80,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(31,3,'BUG_FIX_BACK','后端bug修复','TASK','BUG_FIX_BACK',81,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20'),(32,3,'RELEASE_FOLLOWUP','上线跟进','TASK','RELEASE_FOLLOWUP',90,1,'MANUAL',NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20');
/*!40000 ALTER TABLE `wf_process_template_nodes` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_process_templates`
--

LOCK TABLES `wf_process_templates` WRITE;
/*!40000 ALTER TABLE `wf_process_templates` DISABLE KEYS */;
INSERT INTO `wf_process_templates` VALUES (2,'DEMAND_SEED_FLOW','需求示例流程','DEMAND',1,0,1,26,'2026-03-24 06:22:18','2026-03-24 06:22:18'),(3,'DEMAND_STD_FLOW','需求标准流程','DEMAND',1,1,1,26,'2026-03-24 06:24:20','2026-03-24 06:24:20');
/*!40000 ALTER TABLE `wf_process_templates` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='需求沟通记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_demand_communications`
--

LOCK TABLES `work_demand_communications` WRITE;
/*!40000 ALTER TABLE `work_demand_communications` DISABLE KEYS */;
/*!40000 ALTER TABLE `work_demand_communications` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=77 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_demand_phases`
--

LOCK TABLES `work_demand_phases` WRITE;
/*!40000 ALTER TABLE `work_demand_phases` DISABLE KEYS */;
INSERT INTO `work_demand_phases` VALUES (71,'REQ901','PRODUCT_SOLUTION','产品方案',27,4.0,'DONE',10,'2026-03-14 00:00:00','2026-03-16 00:00:00','[SEED_MOCK] 阶段数据','2026-03-24 06:22:18','2026-03-24 06:22:18'),(72,'REQ901','DEV','前端开发',27,8.0,'IN_PROGRESS',20,'2026-03-17 00:00:00',NULL,'[SEED_MOCK] 阶段数据','2026-03-24 06:22:18','2026-03-24 06:22:18'),(73,'REQ901','TEST','测试阶段',26,6.0,'TODO',30,NULL,NULL,'[SEED_MOCK] 阶段数据','2026-03-24 06:22:18','2026-03-24 06:22:18'),(74,'REQ904','TECH_SOLUTION_BACK','后端方案',28,6.0,'DONE',10,'2026-03-15 00:00:00','2026-03-16 00:00:00','[SEED_MOCK] 阶段数据','2026-03-24 06:22:18','2026-03-24 06:22:18'),(75,'REQ904','DEV_BACK','后端开发',28,10.0,'IN_PROGRESS',20,'2026-03-17 00:00:00',NULL,'[SEED_MOCK] 阶段数据','2026-03-24 06:22:18','2026-03-24 06:22:18'),(76,'REQ904','TEST','测试阶段',26,4.0,'TODO',30,NULL,NULL,'[SEED_MOCK] 阶段数据','2026-03-24 06:22:18','2026-03-24 06:22:18');
/*!40000 ALTER TABLE `work_demand_phases` ENABLE KEYS */;
UNLOCK TABLES;

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
  `participant_role_user_map_json` json DEFAULT NULL COMMENT '需求角色绑定人员映射{ROLE_KEY:user_id}',
  `project_manager` bigint DEFAULT NULL COMMENT '项目负责人',
  `health_status` varchar(10) NOT NULL DEFAULT 'green' COMMENT '健康度 red/yellow/green',
  `group_chat_mode` varchar(20) NOT NULL DEFAULT 'none' COMMENT '拉群方式: auto/none/bind',
  `group_chat_id` varchar(128) DEFAULT NULL COMMENT '绑定飞书群 chat_id',
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
  KEY `idx_health_status` (`health_status`),
  KEY `idx_work_demands_group_chat_mode` (`group_chat_mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_demands`
--

LOCK TABLES `work_demands` WRITE;
/*!40000 ALTER TABLE `work_demands` DISABLE KEYS */;
INSERT INTO `work_demands` VALUES ('REQ901','[SEED_MOCK] Wegic 新人引导优化',27,'ACQUISITION_GROWTH','2026-04-07','IN_PROGRESS','P1',18.0,'[SEED_MOCK] Wegic 新人引导优化 - 假数据',26,'2026-03-24 06:22:18','2026-04-03 07:17:08',NULL,'simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,4.0,3.5),('REQ902','[SEED_MOCK] Wegic 统计筛选增强',27,'USER_VALUE','2026-04-02','TODO','P2',10.0,'[SEED_MOCK] Wegic 统计筛选增强 - 假数据',26,'2026-03-24 06:22:18','2026-04-03 07:17:08',NULL,'simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,1.5,1.0),('REQ903','[SEED_MOCK] Wegic 线上故障复盘',26,'STABILITY_GUARANTEE','2026-03-22','DONE','P2',8.0,'[SEED_MOCK] Wegic 线上故障复盘 - 假数据',26,'2026-03-24 06:22:18','2026-04-03 07:17:08',NULL,'simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,2.0,2.0),('REQ904','[SEED_MOCK] A1 渠道投放看板',28,'ACQUISITION_GROWTH','2026-04-05','IN_PROGRESS','P1',20.0,'[SEED_MOCK] A1 渠道投放看板 - 假数据',26,'2026-03-24 06:22:18','2026-04-03 07:17:08',NULL,'simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,9.0,5.0),('REQ905','[SEED_MOCK] A1 订单漏斗分析',28,'USER_VALUE','2026-04-13','IN_PROGRESS','P0',24.0,'[SEED_MOCK] A1 订单漏斗分析 - 假数据',26,'2026-03-24 06:22:18','2026-03-24 06:24:37',NULL,'simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,0.0,0.0),('REQ906','[SEED_MOCK] A1 发布后跟踪',26,'PROFESSIONAL_FUNCTION','2026-03-19','DONE','P3',6.0,'[SEED_MOCK] A1 发布后跟踪 - 假数据',26,'2026-03-24 06:22:18','2026-03-24 06:22:18',NULL,'simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,0.0,0.0),('REQ907','测试流程',27,NULL,NULL,'IN_PROGRESS','P0',NULL,NULL,26,'2026-03-25 09:06:44','2026-03-25 09:10:06',NULL,'simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,0.0,0.0),('REQ908','测试流程A1',26,NULL,NULL,'IN_PROGRESS','P2',NULL,NULL,26,'2026-03-25 10:47:31','2026-03-25 10:54:43',NULL,'simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,0.0,0.0),('REQ951','Wegic Login Flow Optimization',37,NULL,'2026-03-26','DONE','P1',8.0,'Wegic demand test data',37,'2026-03-26 06:58:43','2026-04-03 07:17:08','2026-03-26 18:45:36','simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,3.0,1.5),('REQ952','Wegic Workbench Performance Tuning',33,NULL,'2026-03-26','TODO','P2',8.0,'Wegic demand test data',33,'2026-03-26 06:58:43','2026-04-03 07:17:08',NULL,'simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,3.0,1.5),('REQ953','A1 Dashboard Filter Enhancement',38,NULL,'2026-03-26','IN_PROGRESS','P1',8.0,'A1 demand test data',38,'2026-03-26 06:58:43','2026-04-03 07:17:08',NULL,'simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,3.0,1.5),('REQ954','A1 Bug Detail UX Optimization',34,NULL,'2026-03-26','TODO','P2',8.0,'A1 demand test data',34,'2026-03-26 06:58:43','2026-04-03 07:17:08',NULL,'simple',NULL,NULL,NULL,NULL,'green','none',NULL,NULL,NULL,NULL,NULL,NULL,3.0,1.5),('REQ955','测试需求',26,NULL,NULL,'DONE','P1',NULL,NULL,26,'2026-04-07 03:06:40','2026-04-07 04:00:09','2026-04-07 12:00:09','advanced',1,'[\"PRODUCT_MANAGER\", \"DESIGNER\", \"FRONTEND_DEV\", \"BACKEND_DEV\", \"QA\"]',NULL,26,'green','bind','oc_3ecfc76acfbbfc91f09a7686e19fbb25','2026-04-07 00:00:00',NULL,NULL,NULL,NULL,0.0,0.0),('REQ956','一键拉群功能测试',26,NULL,NULL,'TODO','P1',NULL,NULL,26,'2026-04-07 04:07:56','2026-04-07 04:07:56',NULL,'advanced',1,'[\"PRODUCT_MANAGER\", \"DESIGNER\", \"FRONTEND_DEV\", \"BACKEND_DEV\", \"QA\"]',NULL,26,'green','auto',NULL,'2026-04-07 00:00:00',NULL,NULL,NULL,NULL,0.0,0.0),('REQ957','测试自动建群',26,NULL,NULL,'TODO','P1',NULL,NULL,26,'2026-04-07 04:30:27','2026-04-07 06:51:36',NULL,'advanced',1,'[\"PRODUCT_MANAGER\", \"DESIGNER\", \"FRONTEND_DEV\", \"BACKEND_DEV\", \"QA\"]',NULL,26,'green','bind','oc_3091e6900efba4aecde392790d085ea5','2026-04-07 00:00:00',NULL,NULL,NULL,NULL,0.0,0.0),('REQ958','自动拉群，且拉指定人员，以及通知测试需求',26,NULL,NULL,'TODO','P1',NULL,NULL,26,'2026-04-07 07:11:07','2026-04-07 07:11:09',NULL,'advanced',1,'[\"PRODUCT_MANAGER\", \"DESIGNER\", \"FRONTEND_DEV\", \"BACKEND_DEV\", \"QA\"]','{\"QA\": 33, \"DESIGNER\": 34, \"BACKEND_DEV\": 26, \"FRONTEND_DEV\": 33, \"PRODUCT_MANAGER\": 26}',26,'green','bind','oc_ea4df5ee06d68672b7f093b0abfe9ec2','2026-04-07 00:00:00',NULL,NULL,NULL,NULL,0.0,0.0),('REQ959','自动拉群，且拉指定人员，以及通知测试需求',26,NULL,NULL,'DONE','P1',NULL,NULL,26,'2026-04-07 07:14:33','2026-04-07 07:18:53','2026-04-07 15:18:53','advanced',1,'[\"PRODUCT_MANAGER\", \"DESIGNER\", \"FRONTEND_DEV\", \"BACKEND_DEV\", \"QA\"]','{\"QA\": 33, \"DESIGNER\": 26, \"BACKEND_DEV\": 34, \"FRONTEND_DEV\": 33, \"PRODUCT_MANAGER\": 34}',26,'green','bind','oc_03d2f1c0454602f5e6c7d0c4b0f51cbe','2026-04-07 00:00:00',NULL,NULL,NULL,NULL,0.0,0.0);
/*!40000 ALTER TABLE `work_demands` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `work_item_types`
--

LOCK TABLES `work_item_types` WRITE;
/*!40000 ALTER TABLE `work_item_types` DISABLE KEYS */;
INSERT INTO `work_item_types` VALUES (1,'DEMAND_DEV','需求开发',1,1,10,'2026-03-20 07:08:33'),(2,'BUG_FIX','Bug修复',1,1,20,'2026-03-20 07:08:33'),(3,'MEETING','会议',0,1,30,'2026-03-20 07:08:33'),(4,'DOC','文档编写',0,1,40,'2026-03-20 07:08:33'),(5,'OPS','日常运维',0,1,50,'2026-03-20 07:08:33');
/*!40000 ALTER TABLE `work_item_types` ENABLE KEYS */;
UNLOCK TABLES;

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
  `description` varchar(2000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_work_log_daily_entry_user_date` (`user_id`,`entry_date`),
  KEY `idx_work_log_daily_entry_log_date` (`log_id`,`entry_date`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_log_daily_entries`
--

LOCK TABLES `work_log_daily_entries` WRITE;
/*!40000 ALTER TABLE `work_log_daily_entries` DISABLE KEYS */;
INSERT INTO `work_log_daily_entries` VALUES (4,41,27,'2026-03-23',3.5,'完成筛选区交互与接口联调',27,'2026-03-24 06:22:18'),(5,42,28,'2026-03-23',5.0,'完成投放明细接口与缓存',28,'2026-03-24 06:22:18'),(6,43,26,'2026-03-22',2.0,'复盘导出字段修复验证',26,'2026-03-24 06:22:18');
/*!40000 ALTER TABLE `work_log_daily_entries` ENABLE KEYS */;
UNLOCK TABLES;

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
  `source` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SYSTEM_SPLIT',
  `note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_work_log_daily_plan_log_date` (`log_id`,`plan_date`),
  KEY `idx_work_log_daily_plan_user_date` (`user_id`,`plan_date`),
  KEY `idx_work_log_daily_plan_date` (`plan_date`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_log_daily_plans`
--

LOCK TABLES `work_log_daily_plans` WRITE;
/*!40000 ALTER TABLE `work_log_daily_plans` DISABLE KEYS */;
INSERT INTO `work_log_daily_plans` VALUES (18,41,27,'2026-03-25',3.0,'MANUAL','补齐边界条件回归',26,'2026-03-24 06:22:18','2026-03-24 06:22:18'),(19,42,28,'2026-03-25',4.0,'SYSTEM_SPLIT','完善导出和分页边界',26,'2026-03-24 06:22:18','2026-03-24 06:22:18'),(20,45,28,'2026-03-26',3.0,'MANUAL','修复总数统计偏差',26,'2026-03-24 06:22:18','2026-03-24 06:22:18');
/*!40000 ALTER TABLE `work_log_daily_plans` ENABLE KEYS */;
UNLOCK TABLES;

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
  `owner_estimate_required` tinyint(1) DEFAULT NULL COMMENT '是否需要 Owner 评估快照：1需要，0不需要，NULL按历史口径回退',
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
  KEY `idx_owner_estimate_required` (`owner_estimate_required`),
  KEY `idx_self_task_difficulty_code` (`self_task_difficulty_code`)
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_logs`
--

LOCK TABLES `work_logs` WRITE;
/*!40000 ALTER TABLE `work_logs` DISABLE KEYS */;
INSERT INTO `work_logs` VALUES (41,27,'2026-03-23',1,'[SEED_MOCK] REQ901 前端页面联调',4.0,NULL,3.5,4.0,NULL,NULL,26,'2026-03-22 10:00:00',0.5,'IN_PROGRESS','OWNER_ASSIGN','REQ901','DEV',26,'2026-03-22','2026-03-26',NULL,'2026-03-24 06:22:18','2026-03-24 06:22:18',NULL),(42,28,'2026-03-23',1,'[SEED_MOCK] REQ904 后端接口开发',6.0,NULL,5.0,6.0,NULL,NULL,26,'2026-03-22 10:00:00',1.0,'IN_PROGRESS','OWNER_ASSIGN','REQ904','DEV_BACK',26,'2026-03-22','2026-03-26',NULL,'2026-03-24 06:22:18','2026-03-24 06:22:18',NULL),(43,26,'2026-03-22',2,'[SEED_MOCK] REQ903 复盘问题关闭',2.0,NULL,2.0,2.0,NULL,NULL,26,'2026-03-22 10:00:00',0.0,'DONE','SELF','REQ903','BUG_FIX_BACK',26,'2026-03-22','2026-03-26','2026-03-24 12:00:00','2026-03-24 06:22:18','2026-03-24 06:22:18',NULL),(44,27,'2026-03-24',3,'[SEED_MOCK] 项目例会同步',1.5,NULL,1.0,NULL,NULL,NULL,26,'2026-03-22 10:00:00',0.0,'DONE','SELF','REQ902','PRODUCT_SOLUTION',26,'2026-03-22','2026-03-26','2026-03-24 12:00:00','2026-03-24 06:22:18','2026-03-24 06:22:18',NULL),(45,28,'2026-03-24',2,'[SEED_MOCK] A1 分页总数修复',3.0,NULL,0.0,3.0,NULL,NULL,26,'2026-03-22 10:00:00',3.0,'TODO','OWNER_ASSIGN','REQ904','BUG_FIX_BACK',26,'2026-03-22','2026-03-26',NULL,'2026-03-24 06:22:18','2026-03-24 06:22:18',NULL),(46,28,'2026-03-24',7,'[流程待办] 需求 REQ905 · 竞品调研 #11',1.0,NULL,0.0,NULL,NULL,NULL,NULL,NULL,1.0,'TODO','WORKFLOW_AUTO','REQ905','COMPETITOR_RESEARCH',NULL,'2026-03-24',NULL,NULL,'2026-03-24 06:24:20','2026-03-24 06:24:20',NULL),(47,27,'2026-03-25',7,'[流程待办] 需求 REQ907 · 竞品调研 #13',1.0,NULL,0.0,NULL,NULL,NULL,NULL,NULL,1.0,'TODO','WORKFLOW_AUTO','REQ907','COMPETITOR_RESEARCH',26,'2026-03-25',NULL,NULL,'2026-03-25 09:06:44','2026-03-25 09:18:19',NULL),(48,37,'2026-03-26',1,'Wegic daily log test data',3.0,NULL,1.5,NULL,NULL,NULL,NULL,NULL,1.5,'IN_PROGRESS','MANUAL','REQ951','DEVELOPMENT',37,'2026-03-26','2026-03-26',NULL,'2026-03-26 06:58:43','2026-03-26 07:08:50',NULL),(49,33,'2026-03-26',1,'Wegic daily log test data',3.0,NULL,1.5,NULL,NULL,NULL,NULL,NULL,1.5,'IN_PROGRESS','MANUAL','REQ952','DEVELOPMENT',33,'2026-03-26','2026-03-26',NULL,'2026-03-26 06:58:43','2026-03-26 07:08:50',NULL),(50,38,'2026-03-26',1,'A1 daily log test data',3.0,NULL,1.5,NULL,NULL,NULL,NULL,NULL,1.5,'IN_PROGRESS','MANUAL','REQ953','DEVELOPMENT',38,'2026-03-26','2026-03-26',NULL,'2026-03-26 06:58:43','2026-03-26 07:08:50',NULL),(51,34,'2026-03-26',1,'A1 daily log test data',3.0,NULL,1.5,NULL,NULL,NULL,NULL,NULL,1.5,'IN_PROGRESS','MANUAL','REQ954','DEVELOPMENT',34,'2026-03-26','2026-03-26',NULL,'2026-03-26 06:58:43','2026-03-26 07:08:50',NULL),(52,26,'2026-04-07',7,'[流程待办] 需求 REQ955 · 评审 #14',1.0,NULL,0.0,NULL,1,NULL,NULL,NULL,0.0,'DONE','WORKFLOW_AUTO','REQ955','REQUIREMENT',NULL,'2026-04-07',NULL,'2026-04-07 11:59:54','2026-04-07 03:58:42','2026-04-07 03:59:54',14),(53,26,'2026-04-07',7,'[流程待办] 需求 REQ955 · 开发 #15',1.0,NULL,0.0,NULL,1,NULL,NULL,NULL,0.0,'DONE','WORKFLOW_AUTO','REQ955','REQUIREMENT',NULL,'2026-04-07',NULL,'2026-04-07 11:59:59','2026-04-07 03:59:54','2026-04-07 03:59:59',15),(54,26,'2026-04-07',7,'[流程待办] 需求 REQ955 · 测试 #16',1.0,NULL,0.0,NULL,1,NULL,NULL,NULL,0.0,'DONE','WORKFLOW_AUTO','REQ955','REQUIREMENT',NULL,'2026-04-07',NULL,'2026-04-07 12:00:05','2026-04-07 03:59:59','2026-04-07 04:00:05',16),(55,26,'2026-04-07',7,'[流程待办] 需求 REQ955 · 上线 #17',1.0,NULL,0.0,NULL,1,NULL,NULL,NULL,0.0,'DONE','WORKFLOW_AUTO','REQ955','REQUIREMENT',NULL,'2026-04-07',NULL,'2026-04-07 12:00:09','2026-04-07 04:00:05','2026-04-07 04:00:09',17);
/*!40000 ALTER TABLE `work_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'beixin_store_staging'
--

--
-- Dumping routines for database 'beixin_store_staging'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-07 16:58:46
