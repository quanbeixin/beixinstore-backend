INSERT INTO permissions (permission_code, permission_name, module_key, enabled, name, description)
VALUES
  ('demand.workflow.template.view', '查看流程模板', 'project_management', 1, '查看流程模板', '查看业务线流程模板'),
  ('demand.workflow.template.edit', '编辑流程模板', 'project_management', 1, '编辑流程模板', '编辑业务线流程模板'),
  ('demand.workflow.template.publish', '发布流程模板', 'project_management', 1, '发布流程模板', '发布业务线流程模板版本'),
  ('demand.workflow.instance.transition', '流转需求流程', 'project_management', 1, '流转需求流程', '推进需求流程节点')
ON DUPLICATE KEY UPDATE
  permission_name = VALUES(permission_name),
  module_key = VALUES(module_key),
  enabled = VALUES(enabled),
  name = VALUES(name),
  description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.permission_code IN (
    'demand.workflow.template.view',
    'demand.workflow.template.edit',
    'demand.workflow.template.publish',
    'demand.workflow.instance.transition'
  )
WHERE UPPER(r.role_key) = 'ADMIN';

UPDATE config_dict_types
SET description = '兼容保留：仅作流程节点候选词库，运行时以业务线流程模板为准'
WHERE type_key IN ('demand_phase', 'requirement_stage', 'demand_phase_type');

UPDATE config_dict_items
SET extra_json = JSON_SET(
  COALESCE(extra_json, JSON_OBJECT()),
  '$.usage_scope', 'candidate_only',
  '$.runtime_source', 'workflow_template',
  '$.editable_hint', '仅影响候选词，不直接影响在途需求流程'
)
WHERE type_key IN ('demand_phase', 'requirement_stage', 'demand_phase_type');
