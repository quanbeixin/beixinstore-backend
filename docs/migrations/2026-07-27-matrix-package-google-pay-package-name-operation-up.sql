SET NAMES utf8mb4;

INSERT INTO `matrix_package_side_notes`
  (`package_id`, `note_type`, `content`, `owner_user_id`, `owner_name`, `created_by`, `updated_by`)
SELECT
  devops.package_id,
  'OPERATION',
  JSON_OBJECT(
    'prodGooglePayPackageName',
    JSON_UNQUOTE(JSON_EXTRACT(CAST(devops.content AS JSON), '$.prodGooglePayPackageName')),
    'testGooglePayPackageName',
    JSON_UNQUOTE(JSON_EXTRACT(CAST(devops.content AS JSON), '$.testGooglePayPackageName'))
  ),
  NULL,
  '',
  NULL,
  NULL
FROM `matrix_package_side_notes` devops
LEFT JOIN `matrix_package_side_notes` operation
  ON operation.package_id = devops.package_id
 AND operation.note_type = 'OPERATION'
WHERE devops.note_type = 'DEVOPS'
  AND JSON_VALID(devops.content)
  AND (
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(CAST(devops.content AS JSON), '$.prodGooglePayPackageName')), '') <> ''
    OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(CAST(devops.content AS JSON), '$.testGooglePayPackageName')), '') <> ''
  )
  AND operation.id IS NULL
ON DUPLICATE KEY UPDATE
  content = JSON_MERGE_PATCH(
    COALESCE(NULLIF(`matrix_package_side_notes`.`content`, ''), '{}'),
    VALUES(content)
  ),
  updated_at = CURRENT_TIMESTAMP;

UPDATE `matrix_package_side_notes` operation
INNER JOIN `matrix_package_side_notes` devops
  ON devops.package_id = operation.package_id
 AND devops.note_type = 'DEVOPS'
SET
  operation.content = JSON_MERGE_PATCH(
    COALESCE(NULLIF(operation.content, ''), '{}'),
    JSON_OBJECT(
      'prodGooglePayPackageName',
      COALESCE(
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CAST(operation.content AS JSON), '$.prodGooglePayPackageName')), ''),
        JSON_UNQUOTE(JSON_EXTRACT(CAST(devops.content AS JSON), '$.prodGooglePayPackageName'))
      ),
      'testGooglePayPackageName',
      COALESCE(
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CAST(operation.content AS JSON), '$.testGooglePayPackageName')), ''),
        JSON_UNQUOTE(JSON_EXTRACT(CAST(devops.content AS JSON), '$.testGooglePayPackageName'))
      )
    )
  ),
  operation.updated_at = CURRENT_TIMESTAMP
WHERE operation.note_type = 'OPERATION'
  AND JSON_VALID(operation.content)
  AND JSON_VALID(devops.content)
  AND (
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(CAST(devops.content AS JSON), '$.prodGooglePayPackageName')), '') <> ''
    OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(CAST(devops.content AS JSON), '$.testGooglePayPackageName')), '') <> ''
  );

UPDATE `matrix_package_side_notes`
SET
  content = JSON_REMOVE(
    CAST(content AS JSON),
    '$.prodGooglePayPackageName',
    '$.testGooglePayPackageName'
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE note_type = 'DEVOPS'
  AND JSON_VALID(content)
  AND (
    JSON_CONTAINS_PATH(CAST(content AS JSON), 'one', '$.prodGooglePayPackageName')
    OR JSON_CONTAINS_PATH(CAST(content AS JSON), 'one', '$.testGooglePayPackageName')
  );
