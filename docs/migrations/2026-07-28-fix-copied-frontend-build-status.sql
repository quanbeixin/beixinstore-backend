START TRANSACTION;

SELECT
  'before' AS stage,
  mp.id AS package_db_id,
  mp.package_name,
  mp.status_code AS package_status,
  frontendBuildNode.status_code AS frontend_build_status,
  frontendBuildNode.started_at AS frontend_build_started_at,
  frontendBuildNode.completed_at AS frontend_build_completed_at,
  frontendBuildNode.completed_by AS frontend_build_completed_by,
  backendNode.status_code AS backend_script_status
FROM matrix_packages mp
JOIN matrix_package_production_nodes designNode
  ON designNode.package_id = mp.id
 AND designNode.node_code = 'DESIGN_PRODUCTION'
JOIN matrix_package_production_nodes frontendBuildNode
  ON frontendBuildNode.package_id = mp.id
 AND frontendBuildNode.node_code = 'FRONTEND_BUILD'
LEFT JOIN matrix_package_production_nodes backendNode
  ON backendNode.package_id = mp.id
 AND backendNode.node_code = 'BACKEND_SCRIPT'
WHERE mp.deleted_at IS NULL
  AND mp.package_name IN ('Shadivo', 'Rendrise', 'Flarcast', 'Runilens', 'Mylolens')
  AND designNode.status_code = 'COMPLETED'
  AND frontendBuildNode.status_code = 'COMPLETED'
  AND frontendBuildNode.completed_at = designNode.completed_at
  AND COALESCE(frontendBuildNode.completed_by, 0) = COALESCE(designNode.completed_by, 0)
ORDER BY FIELD(mp.package_name, 'Shadivo', 'Rendrise', 'Flarcast', 'Runilens', 'Mylolens');

UPDATE matrix_package_production_nodes frontendBuildNode
JOIN matrix_packages mp
  ON mp.id = frontendBuildNode.package_id
 AND mp.deleted_at IS NULL
JOIN matrix_package_production_nodes designNode
  ON designNode.package_id = mp.id
 AND designNode.node_code = 'DESIGN_PRODUCTION'
SET frontendBuildNode.status_code = 'NOT_STARTED',
    frontendBuildNode.block_reason = '',
    frontendBuildNode.started_by = NULL,
    frontendBuildNode.started_at = NULL,
    frontendBuildNode.completed_by = NULL,
    frontendBuildNode.completed_at = NULL,
    frontendBuildNode.updated_by = NULL,
    frontendBuildNode.updated_at = CURRENT_TIMESTAMP
WHERE mp.package_name IN ('Shadivo', 'Rendrise', 'Flarcast', 'Runilens', 'Mylolens')
  AND frontendBuildNode.node_code = 'FRONTEND_BUILD'
  AND designNode.status_code = 'COMPLETED'
  AND frontendBuildNode.status_code = 'COMPLETED'
  AND frontendBuildNode.completed_at = designNode.completed_at
  AND COALESCE(frontendBuildNode.completed_by, 0) = COALESCE(designNode.completed_by, 0);

UPDATE matrix_packages
SET status_code = 'IN_DEVELOPMENT',
    updated_by = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND package_name IN ('Shadivo', 'Rendrise')
  AND status_code = 'TESTING';

SELECT
  'after' AS stage,
  mp.id AS package_db_id,
  mp.package_name,
  mp.status_code AS package_status,
  frontendBuildNode.status_code AS frontend_build_status,
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
  AND mp.package_name IN ('Shadivo', 'Rendrise', 'Flarcast', 'Runilens', 'Mylolens')
ORDER BY FIELD(mp.package_name, 'Shadivo', 'Rendrise', 'Flarcast', 'Runilens', 'Mylolens');

COMMIT;
