INSERT INTO matrix_package_production_nodes (
  package_id,
  node_code,
  status_code,
  block_reason,
  owner_user_id,
  owner_name,
  expected_delivery_date,
  expected_delivery_date_source,
  started_by,
  started_at,
  completed_by,
  completed_at,
  updated_by,
  created_at,
  updated_at
)
SELECT
  source.package_id,
  'FRONTEND_BUILD',
  source.status_code,
  source.block_reason,
  source.owner_user_id,
  source.owner_name,
  source.expected_delivery_date,
  COALESCE(source.expected_delivery_date_source, 'AUTO_T'),
  source.started_by,
  source.started_at,
  source.completed_by,
  source.completed_at,
  source.updated_by,
  NOW(),
  NOW()
FROM matrix_package_production_nodes source
LEFT JOIN matrix_package_production_nodes target
  ON target.package_id = source.package_id
 AND target.node_code = 'FRONTEND_BUILD'
WHERE source.node_code = 'DESIGN_PRODUCTION'
  AND target.id IS NULL;
