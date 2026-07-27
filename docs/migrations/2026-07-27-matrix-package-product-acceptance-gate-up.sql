SET NAMES utf8mb4;

SET @matrix_package_production_template = '{"schema_version":2,"entry_node_key":"START","nodes":[{"node_key":"START","node_name":"开始","node_type":"MILESTONE","phase_key":"requirement","sort_order":10,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false},{"node_key":"MATRIX_PRODUCTION","node_name":"生产阶段","node_type":"EXECUTE","phase_key":"develop","sort_order":20,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false},{"node_key":"TEST_ACCEPTANCE","node_name":"测试通测","node_type":"QA","phase_key":"test","sort_order":30,"participant_roles":["QA"],"owner_estimate_required":false,"parallel_group_key":"MATRIX_SIDE_ACCEPTANCE"},{"node_key":"OPERATION_ACCEPTANCE","node_name":"运营验收","node_type":"REVIEW","phase_key":"test","sort_order":40,"participant_roles":["OPERATIONS"],"owner_estimate_required":false,"parallel_group_key":"MATRIX_SIDE_ACCEPTANCE"},{"node_key":"DESIGN_ACCEPTANCE","node_name":"设计验收","node_type":"REVIEW","phase_key":"test","sort_order":50,"participant_roles":["DESIGNER"],"owner_estimate_required":false,"parallel_group_key":"MATRIX_SIDE_ACCEPTANCE"},{"node_key":"PRODUCT_ACCEPTANCE","node_name":"产品验收","node_type":"REVIEW","phase_key":"test","sort_order":60,"participant_roles":["PRODUCT_MANAGER"],"owner_estimate_required":false},{"node_key":"DELIVERY_REVIEW","node_name":"交付提审","node_type":"RELEASE","phase_key":"release","sort_order":70,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false}],"edges":[{"from":"START","to":"MATRIX_PRODUCTION"},{"from":"MATRIX_PRODUCTION","to":"TEST_ACCEPTANCE"},{"from":"MATRIX_PRODUCTION","to":"OPERATION_ACCEPTANCE"},{"from":"MATRIX_PRODUCTION","to":"DESIGN_ACCEPTANCE"},{"from":"TEST_ACCEPTANCE","to":"PRODUCT_ACCEPTANCE"},{"from":"OPERATION_ACCEPTANCE","to":"PRODUCT_ACCEPTANCE"},{"from":"DESIGN_ACCEPTANCE","to":"PRODUCT_ACCEPTANCE"},{"from":"PRODUCT_ACCEPTANCE","to":"DELIVERY_REVIEW"}]}';

UPDATE `project_templates`
SET
  `description` = '矩阵包生产流水线自动建需求使用的轻量流程：开始 -> 生产阶段 -> 测试/运营/设计并行验收 -> 产品验收 -> 交付提审。',
  `node_config` = CAST(@matrix_package_production_template AS JSON),
  `status` = 1
WHERE `name` = '矩阵包生产流程';

UPDATE `work_demands` d
INNER JOIN `project_templates` pt
  ON pt.id = d.template_id
INNER JOIN `matrix_packages` mp
  ON mp.linked_demand_id = d.id
SET
  d.participant_roles_json = CAST('["DEMAND_OWNER","QA","PRODUCT_MANAGER","OPERATIONS","DESIGNER"]' AS JSON),
  d.updated_at = NOW()
WHERE pt.name = '矩阵包生产流程'
  AND mp.deleted_at IS NULL
  AND d.status <> 'CANCELLED';

SELECT
  `id`,
  `name`,
  `status`,
  JSON_UNQUOTE(JSON_EXTRACT(`node_config`, '$.entry_node_key')) AS `entry_node_key`,
  JSON_LENGTH(`node_config`, '$.nodes') AS `node_count`,
  JSON_LENGTH(`node_config`, '$.edges') AS `edge_count`
FROM `project_templates`
WHERE `name` = '矩阵包生产流程';
