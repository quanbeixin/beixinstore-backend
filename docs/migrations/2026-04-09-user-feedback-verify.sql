-- User Feedback Migration (VERIFY)
-- Generated: 2026-04-09

SET NAMES utf8mb4;

SELECT
  TABLE_NAME,
  ENGINE,
  TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('user_feedback', 'feedback_ai_prompt_configs')
ORDER BY TABLE_NAME ASC;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'user_feedback'
  AND COLUMN_NAME IN ('date', 'user_email', 'product', 'status', 'ai_processed', 'ai_category')
ORDER BY COLUMN_NAME ASC;

SELECT
  permission_code,
  permission_name,
  module_key,
  enabled
FROM permissions
WHERE permission_code IN ('feedback.view', 'feedback.manage', 'feedback.ai.analyze')
ORDER BY permission_code ASC;

SELECT
  r.id AS role_id,
  r.name AS role_name,
  r.role_key,
  p.permission_code
FROM role_permissions rp
INNER JOIN roles r ON r.id = rp.role_id
INNER JOIN permissions p ON p.id = rp.permission_id
WHERE p.permission_code IN ('feedback.view', 'feedback.manage', 'feedback.ai.analyze')
ORDER BY r.id ASC, p.permission_code ASC;
