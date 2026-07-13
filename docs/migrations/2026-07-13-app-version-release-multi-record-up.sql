SET NAMES utf8mb4;

SET @has_unique_matrix_package_index := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND index_name = 'uk_app_version_release_matrix_package'
);

SET @drop_unique_matrix_package_index_sql := IF(
  @has_unique_matrix_package_index > 0,
  'ALTER TABLE app_version_releases DROP INDEX uk_app_version_release_matrix_package',
  'SELECT 1'
);

PREPARE drop_unique_matrix_package_index_stmt FROM @drop_unique_matrix_package_index_sql;
EXECUTE drop_unique_matrix_package_index_stmt;
DEALLOCATE PREPARE drop_unique_matrix_package_index_stmt;

SET @has_matrix_package_index := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'app_version_releases'
    AND index_name = 'idx_app_version_release_matrix_package'
);

SET @add_matrix_package_index_sql := IF(
  @has_matrix_package_index = 0,
  'ALTER TABLE app_version_releases ADD KEY idx_app_version_release_matrix_package (matrix_package_id)',
  'SELECT 1'
);

PREPARE add_matrix_package_index_stmt FROM @add_matrix_package_index_sql;
EXECUTE add_matrix_package_index_stmt;
DEALLOCATE PREPARE add_matrix_package_index_stmt;
