START TRANSACTION;

SELECT
  'before' AS stage,
  mp.id AS package_db_id,
  mp.package_name,
  mp.status_code AS package_status,
  frontendBuildNode.status_code AS frontend_build_status,
  frontendBuildNode.created_at AS frontend_build_created_at,
  frontendBuildNode.started_at AS frontend_build_started_at,
  frontendBuildNode.completed_at AS frontend_build_completed_at,
  frontendBuildNode.completed_by AS frontend_build_completed_by,
  backendNode.status_code AS backend_script_status
FROM matrix_packages mp
JOIN matrix_package_production_nodes frontendBuildNode
  ON frontendBuildNode.package_id = mp.id
 AND frontendBuildNode.node_code = 'FRONTEND_BUILD'
LEFT JOIN matrix_package_production_nodes backendNode
  ON backendNode.package_id = mp.id
 AND backendNode.node_code = 'BACKEND_SCRIPT'
WHERE mp.deleted_at IS NULL
  AND mp.package_name = 'Vistell'
  AND frontendBuildNode.status_code = 'COMPLETED'
  AND frontendBuildNode.created_at > frontendBuildNode.completed_at;

UPDATE matrix_package_production_nodes frontendBuildNode
JOIN matrix_packages mp
  ON mp.id = frontendBuildNode.package_id
 AND mp.deleted_at IS NULL
SET frontendBuildNode.status_code = 'NOT_STARTED',
    frontendBuildNode.block_reason = '',
    frontendBuildNode.started_by = NULL,
    frontendBuildNode.started_at = NULL,
    frontendBuildNode.completed_by = NULL,
    frontendBuildNode.completed_at = NULL,
    frontendBuildNode.updated_by = NULL,
    frontendBuildNode.updated_at = CURRENT_TIMESTAMP
WHERE mp.package_name = 'Vistell'
  AND frontendBuildNode.node_code = 'FRONTEND_BUILD'
  AND frontendBuildNode.status_code = 'COMPLETED'
  AND frontendBuildNode.created_at > frontendBuildNode.completed_at;

UPDATE matrix_packages
SET status_code = 'IN_DEVELOPMENT',
    updated_by = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND package_name = 'Vistell'
  AND status_code = 'TESTING';

SELECT
  'after' AS stage,
  mp.id AS package_db_id,
  mp.package_name,
  mp.status_code AS package_status,
  frontendBuildNode.status_code AS frontend_build_status,
  frontendBuildNode.created_at AS frontend_build_created_at,
  frontendBuildNode.started_at AS frontend_build_started_at,
  frontendBuildNode.completed_at AS frontend_build_completed_at,
  frontendBuildNode.completed_by AS frontend_build_completed_by,
  backendNode.status_code AS backend_script_status
FROM matrix_packages mp
JOIN matrix_package_production_nodes frontendBuildNode
  ON frontendBuildNode.package_id = mp.id
 AND frontendBuildNode.node_code = 'FRONTEND_BUILD'
LEFT JOIN matrix_package_production_nodes backendNode
  ON backendNode.package_id = mp.id
 AND backendNode.node_code = 'BACKEND_SCRIPT'
WHERE mp.deleted_at IS NULL
  AND mp.package_name = 'Vistell';

COMMIT;
