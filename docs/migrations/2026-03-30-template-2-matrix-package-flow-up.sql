-- Template #2 Matrix Package Flow (UP)
-- Generated: 2026-03-30
-- Purpose:
-- 1) Override project_templates.id = 2
-- 2) Initialize matrix package promotion workflow using schema_version = 2 graph config
-- Notes:
-- - 运维开发节点绑定 DEVOPS_DEV
-- - 当前库内无需求绑定模板 #2，可直接覆盖

SET NAMES utf8mb4;

START TRANSACTION;

UPDATE `project_templates`
SET
  `name` = '矩阵包推进流程',
  `description` = '矩阵包推进流程模板：覆盖模板 #2，按业务参与角色自动裁剪节点，适用于矩阵包需求的立项、开发、送审、投放全链路推进。',
  `node_config` = CAST('{"schema_version":2,"entry_node_key":"START","nodes":[{"node_key":"START","node_name":"开始","node_type":"MILESTONE","phase_key":"requirement","sort_order":10,"participant_roles":[]},{"node_key":"PRD_PLAN","node_name":"PRD方案","node_type":"DESIGN","phase_key":"plan","sort_order":20,"participant_roles":["PRODUCT_MANAGER"]},{"node_key":"OPERATIONS_MATERIAL_PREP","node_name":"运营物料准备","node_type":"EXECUTE","phase_key":"operate","sort_order":30,"participant_roles":["OPERATIONS"]},{"node_key":"STORE_CONFIGURATION","node_name":"商店配置","node_type":"EXECUTE","phase_key":"operate","sort_order":40,"participant_roles":["OPERATIONS"]},{"node_key":"REQUIREMENT_REVIEW","node_name":"需求评审","node_type":"REVIEW","phase_key":"requirement","sort_order":50,"participant_roles":["DEMAND_OWNER","PRODUCT_MANAGER"]},{"node_key":"DESIGN_STAGE","node_name":"设计阶段","node_type":"DESIGN","phase_key":"design","sort_order":60,"participant_roles":["DESIGNER"]},{"node_key":"FRONTEND_DEV","node_name":"前端开发","node_type":"EXECUTE","phase_key":"develop","sort_order":70,"participant_roles":["FRONTEND_DEV"]},{"node_key":"DEVOPS_DEV","node_name":"运维开发","node_type":"EXECUTE","phase_key":"develop","sort_order":80,"participant_roles":["DEVOPS_DEV"]},{"node_key":"BACKEND_DEV","node_name":"后端开发","node_type":"EXECUTE","phase_key":"develop","sort_order":90,"participant_roles":["BACKEND_DEV"]},{"node_key":"RND_SUBMIT_TEST","node_name":"研发提测","node_type":"MILESTONE","phase_key":"test","sort_order":100,"participant_roles":["FRONTEND_DEV","BACKEND_DEV","DEVOPS_DEV"]},{"node_key":"TEST_NOTIFICATION","node_name":"测试通知","node_type":"QA","phase_key":"test","sort_order":110,"participant_roles":["QA"]},{"node_key":"PRODUCT_ACCEPTANCE","node_name":"产品验收","node_type":"REVIEW","phase_key":"test","sort_order":120,"participant_roles":["PRODUCT_MANAGER"]},{"node_key":"UI_ACCEPTANCE","node_name":"UI验收","node_type":"REVIEW","phase_key":"test","sort_order":130,"participant_roles":["DESIGNER"]},{"node_key":"FIRST_REVIEW_SUBMISSION","node_name":"一轮送审","node_type":"REVIEW","phase_key":"release","sort_order":140,"participant_roles":["OPERATIONS"]},{"node_key":"BUG_RETEST_ACCEPTANCE","node_name":"bug复测验收","node_type":"QA","phase_key":"test","sort_order":150,"participant_roles":["QA"]},{"node_key":"REVIEW_APPROVED","node_name":"审核通过","node_type":"MILESTONE","phase_key":"release","sort_order":160,"participant_roles":[]},{"node_key":"AD_ACCOUNT_APPLICATION","node_name":"投放广告账号申请","node_type":"EXECUTE","phase_key":"operate","sort_order":170,"participant_roles":["MEDIA_BUYER"]},{"node_key":"SDK_FB_REMOTE_CONFIG","node_name":"SDK/FB云控配置","node_type":"EXECUTE","phase_key":"operate","sort_order":180,"participant_roles":["DEVOPS_DEV"]},{"node_key":"AD_PREPARATION","node_name":"投放广告准备","node_type":"EXECUTE","phase_key":"operate","sort_order":190,"participant_roles":["MEDIA_BUYER"]},{"node_key":"SDK_FUNCTION_TEST","node_name":"SDK功能测试","node_type":"QA","phase_key":"test","sort_order":200,"participant_roles":["QA"]},{"node_key":"FINAL_ACCEPTANCE","node_name":"最终验收","node_type":"REVIEW","phase_key":"release","sort_order":210,"participant_roles":["DEMAND_OWNER","PRODUCT_MANAGER"]},{"node_key":"LAUNCH","node_name":"投放","node_type":"RELEASE","phase_key":"operate","sort_order":220,"participant_roles":["MEDIA_BUYER"]},{"node_key":"END","node_name":"结束","node_type":"MILESTONE","phase_key":"operate","sort_order":230,"participant_roles":[]}],"edges":[{"from":"START","to":"PRD_PLAN"},{"from":"START","to":"OPERATIONS_MATERIAL_PREP"},{"from":"PRD_PLAN","to":"STORE_CONFIGURATION"},{"from":"PRD_PLAN","to":"REQUIREMENT_REVIEW"},{"from":"OPERATIONS_MATERIAL_PREP","to":"REQUIREMENT_REVIEW"},{"from":"OPERATIONS_MATERIAL_PREP","to":"DESIGN_STAGE"},{"from":"STORE_CONFIGURATION","to":"FRONTEND_DEV"},{"from":"REQUIREMENT_REVIEW","to":"FRONTEND_DEV"},{"from":"DESIGN_STAGE","to":"FRONTEND_DEV"},{"from":"REQUIREMENT_REVIEW","to":"DEVOPS_DEV"},{"from":"DESIGN_STAGE","to":"DEVOPS_DEV"},{"from":"FRONTEND_DEV","to":"BACKEND_DEV"},{"from":"DEVOPS_DEV","to":"BACKEND_DEV"},{"from":"BACKEND_DEV","to":"RND_SUBMIT_TEST"},{"from":"RND_SUBMIT_TEST","to":"TEST_NOTIFICATION"},{"from":"RND_SUBMIT_TEST","to":"PRODUCT_ACCEPTANCE"},{"from":"RND_SUBMIT_TEST","to":"UI_ACCEPTANCE"},{"from":"TEST_NOTIFICATION","to":"FIRST_REVIEW_SUBMISSION"},{"from":"PRODUCT_ACCEPTANCE","to":"FIRST_REVIEW_SUBMISSION"},{"from":"UI_ACCEPTANCE","to":"BUG_RETEST_ACCEPTANCE"},{"from":"FIRST_REVIEW_SUBMISSION","to":"REVIEW_APPROVED"},{"from":"BUG_RETEST_ACCEPTANCE","to":"REVIEW_APPROVED"},{"from":"REVIEW_APPROVED","to":"AD_ACCOUNT_APPLICATION"},{"from":"AD_ACCOUNT_APPLICATION","to":"SDK_FB_REMOTE_CONFIG"},{"from":"AD_ACCOUNT_APPLICATION","to":"AD_PREPARATION"},{"from":"SDK_FB_REMOTE_CONFIG","to":"SDK_FUNCTION_TEST"},{"from":"AD_PREPARATION","to":"SDK_FUNCTION_TEST"},{"from":"SDK_FUNCTION_TEST","to":"FINAL_ACCEPTANCE"},{"from":"FINAL_ACCEPTANCE","to":"LAUNCH"},{"from":"LAUNCH","to":"END"}]}' AS JSON),
  `status` = 1
WHERE `id` = 2;

SELECT
  `id`,
  `name`,
  `status`,
  JSON_UNQUOTE(JSON_EXTRACT(`node_config`, '$.entry_node_key')) AS `entry_node_key`,
  JSON_LENGTH(`node_config`, '$.nodes') AS `node_count`,
  JSON_LENGTH(`node_config`, '$.edges') AS `edge_count`,
  DATE_FORMAT(`updated_at`, '%Y-%m-%d %H:%i:%s') AS `updated_at`
FROM `project_templates`
WHERE `id` = 2;

COMMIT;
