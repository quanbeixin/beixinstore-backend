-- Migration: create bug_change_logs table
CREATE TABLE IF NOT EXISTS bug_change_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bug_id INT UNSIGNED NOT NULL,
  action_type VARCHAR(32) NOT NULL,
  action_label VARCHAR(128) NOT NULL,
  source VARCHAR(64) DEFAULT 'BUG',
  operator_user_id INT NULL,
  operator_name VARCHAR(128) DEFAULT NULL,
  change_summary VARCHAR(255) DEFAULT NULL,
  before_json LONGTEXT DEFAULT NULL,
  after_json LONGTEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bug_id (bug_id),
  INDEX idx_operator_user_id (operator_user_id)
);
