-- User Feedback Migration (UP)
-- Generated: 2026-04-09
-- Scope:
-- 1) Create user feedback domain tables.
-- 2) Register feedback permissions.
-- 3) Grant permissions to ADMIN / SUPER_ADMIN.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS user_feedback (
  id BIGINT NOT NULL AUTO_INCREMENT,
  `date` DATETIME NULL,
  user_email VARCHAR(255) NOT NULL DEFAULT '',
  product VARCHAR(100) NOT NULL DEFAULT '未指定',
  channel VARCHAR(100) NOT NULL DEFAULT '其他',
  user_question TEXT NOT NULL,
  user_question_cn TEXT NULL,
  issue_type VARCHAR(100) NULL,
  user_request VARCHAR(255) NULL,
  is_new_request TINYINT(1) NOT NULL DEFAULT 0,
  ai_category VARCHAR(100) NULL,
  ai_sentiment VARCHAR(32) NULL,
  ai_reply TEXT NULL,
  ai_reply_en TEXT NULL,
  support_reply TEXT NULL,
  support_reply_en TEXT NULL,
  ai_processed TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_feedback_date (`date`),
  KEY idx_user_feedback_status (status),
  KEY idx_user_feedback_product (product),
  KEY idx_user_feedback_ai_processed (ai_processed),
  KEY idx_user_feedback_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feedback_ai_prompt_configs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  config_key VARCHAR(64) NOT NULL,
  config_value_json JSON NOT NULL,
  updated_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_feedback_ai_prompt_configs_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'feedback.view', '查看用户反馈', 'feedback', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'feedback.view'
);

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'feedback.manage', '管理用户反馈', 'feedback', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'feedback.manage'
);

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'feedback.ai.analyze', '执行反馈AI分析', 'feedback', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'feedback.ai.analyze'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.permission_code IN ('feedback.view', 'feedback.manage', 'feedback.ai.analyze')
LEFT JOIN role_permissions rp
  ON rp.role_id = r.id
 AND rp.permission_id = p.id
WHERE rp.role_id IS NULL
  AND UPPER(COALESCE(r.role_key, '')) IN ('SUPER_ADMIN', 'ADMIN');
