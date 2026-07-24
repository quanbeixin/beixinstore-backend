SET NAMES utf8mb4;

SET @matrix_package_production_template = '{"schema_version":2,"entry_node_key":"START","nodes":[{"node_key":"START","node_name":"开始","node_type":"MILESTONE","phase_key":"requirement","sort_order":10,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false},{"node_key":"MATRIX_PRODUCTION","node_name":"生产阶段","node_type":"EXECUTE","phase_key":"develop","sort_order":20,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false},{"node_key":"TEST_ACCEPTANCE","node_name":"测试通测","node_type":"QA","phase_key":"test","sort_order":30,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false},{"node_key":"PRODUCT_ACCEPTANCE","node_name":"产品验收","node_type":"REVIEW","phase_key":"test","sort_order":40,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false},{"node_key":"DELIVERY_REVIEW","node_name":"交付提审","node_type":"RELEASE","phase_key":"release","sort_order":50,"participant_roles":["DEMAND_OWNER"],"owner_estimate_required":false}],"edges":[{"from":"START","to":"MATRIX_PRODUCTION"},{"from":"MATRIX_PRODUCTION","to":"TEST_ACCEPTANCE"},{"from":"TEST_ACCEPTANCE","to":"PRODUCT_ACCEPTANCE"},{"from":"PRODUCT_ACCEPTANCE","to":"DELIVERY_REVIEW"}]}';

UPDATE `project_templates`
SET
  `description` = '矩阵包生产流水线自动建需求使用的轻量流程：开始 -> 生产阶段 -> 测试通测 -> 产品验收 -> 交付提审。',
  `node_config` = CAST(@matrix_package_production_template AS JSON),
  `status` = 1
WHERE `name` = '矩阵包生产流程';

UPDATE `wf_process_instance_nodes` n
INNER JOIN `wf_process_instances` i
  ON i.id = n.instance_id
INNER JOIN `matrix_packages` mp
  ON mp.linked_demand_id = i.biz_id
SET
  n.node_name_snapshot = '测试通测',
  n.updated_at = NOW()
WHERE i.biz_type = 'DEMAND'
  AND n.node_key = 'TEST_ACCEPTANCE'
  AND n.node_name_snapshot <> '测试通测'
  AND mp.deleted_at IS NULL;

UPDATE `wf_process_instance_nodes` n
INNER JOIN `wf_process_instances` i
  ON i.id = n.instance_id
INNER JOIN `matrix_packages` mp
  ON mp.linked_demand_id = i.biz_id
SET
  n.sort_order = 50,
  n.updated_at = NOW()
WHERE i.biz_type = 'DEMAND'
  AND n.node_key = 'DELIVERY_REVIEW'
  AND n.sort_order < 50
  AND mp.deleted_at IS NULL;

INSERT INTO `wf_process_instance_nodes`
  (`instance_id`, `node_key`, `node_name_snapshot`, `node_type`, `phase_key`, `sort_order`, `status`, `assignee_user_id`, `created_at`, `updated_at`)
SELECT
  i.id,
  'PRODUCT_ACCEPTANCE',
  '产品验收',
  'REVIEW',
  'test',
  40,
  CASE
    WHEN i.current_node_key = 'DELIVERY_REVIEW'
     AND COALESCE(mp.status_code, '') = 'TESTING'
    THEN 'IN_PROGRESS'
    ELSE 'TODO'
  END,
  COALESCE(testNode.assignee_user_id, d.owner_user_id),
  NOW(),
  NOW()
FROM `wf_process_instances` i
INNER JOIN `matrix_packages` mp
  ON mp.linked_demand_id = i.biz_id
INNER JOIN `work_demands` d
  ON d.id = i.biz_id
LEFT JOIN `wf_process_instance_nodes` testNode
  ON testNode.instance_id = i.id
 AND testNode.node_key = 'TEST_ACCEPTANCE'
LEFT JOIN `wf_process_instance_nodes` productNode
  ON productNode.instance_id = i.id
 AND productNode.node_key = 'PRODUCT_ACCEPTANCE'
WHERE i.biz_type = 'DEMAND'
  AND mp.deleted_at IS NULL
  AND productNode.id IS NULL;

UPDATE `wf_process_instances` i
INNER JOIN `matrix_packages` mp
  ON mp.linked_demand_id = i.biz_id
INNER JOIN `wf_process_instance_nodes` productNode
  ON productNode.instance_id = i.id
 AND productNode.node_key = 'PRODUCT_ACCEPTANCE'
SET
  i.current_node_key = 'PRODUCT_ACCEPTANCE',
  i.updated_at = NOW()
WHERE i.biz_type = 'DEMAND'
  AND i.current_node_key = 'DELIVERY_REVIEW'
  AND COALESCE(mp.status_code, '') = 'TESTING'
  AND productNode.status = 'IN_PROGRESS'
  AND mp.deleted_at IS NULL;

SELECT
  `id`,
  `name`,
  `status`,
  JSON_UNQUOTE(JSON_EXTRACT(`node_config`, '$.entry_node_key')) AS `entry_node_key`,
  JSON_LENGTH(`node_config`, '$.nodes') AS `node_count`
FROM `project_templates`
WHERE `name` = '矩阵包生产流程';
