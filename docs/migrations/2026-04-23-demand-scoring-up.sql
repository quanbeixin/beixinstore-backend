-- Demand Scoring Migration (UP)
-- Generated: 2026-04-23
-- Scope:
-- 1) Add demand scoring domain tables.
-- 2) Register scoring permissions and menu visibility.
-- 3) Seed PROJECT_MANAGER participant role.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS demand_score_tasks (
  id BIGINT NOT NULL AUTO_INCREMENT,
  demand_id VARCHAR(64) NOT NULL,
  demand_name VARCHAR(255) NOT NULL DEFAULT '',
  owner_user_id INT NULL,
  project_manager_user_id INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  result_ready TINYINT(1) NOT NULL DEFAULT 0,
  partial_missing TINYINT(1) NOT NULL DEFAULT 0,
  deadline_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  generated_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_demand_score_tasks_demand (demand_id),
  KEY idx_demand_score_tasks_status (status),
  KEY idx_demand_score_tasks_deadline (deadline_at),
  KEY idx_demand_score_tasks_owner (owner_user_id),
  KEY idx_demand_score_tasks_pm (project_manager_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS demand_score_subjects (
  id BIGINT NOT NULL AUTO_INCREMENT,
  task_id BIGINT NOT NULL,
  demand_id VARCHAR(64) NOT NULL,
  evaluatee_user_id INT NOT NULL,
  evaluatee_name VARCHAR(128) NOT NULL DEFAULT '',
  source_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  final_score DECIMAL(5,2) NULL,
  delivery_score DECIMAL(5,2) NULL,
  collaboration_score DECIMAL(5,2) NULL,
  responsibility_score DECIMAL(5,2) NULL,
  effective_weight DECIMAL(8,2) NOT NULL DEFAULT 0,
  submitted_role_keys_json JSON NULL,
  missing_role_keys_json JSON NULL,
  result_calculated_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_demand_score_subject (task_id, evaluatee_user_id),
  KEY idx_demand_score_subjects_demand (demand_id),
  KEY idx_demand_score_subjects_evaluatee (evaluatee_user_id),
  KEY idx_demand_score_subjects_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS demand_score_slots (
  id BIGINT NOT NULL AUTO_INCREMENT,
  task_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  demand_id VARCHAR(64) NOT NULL,
  evaluatee_user_id INT NOT NULL,
  evaluator_user_id INT NOT NULL,
  evaluator_name VARCHAR(128) NOT NULL DEFAULT '',
  slot_type VARCHAR(32) NOT NULL,
  slot_key VARCHAR(64) NOT NULL,
  base_weight DECIMAL(8,2) NOT NULL DEFAULT 0,
  role_keys_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  skipped_reason VARCHAR(255) NULL,
  submitted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_demand_score_slot (subject_id, evaluator_user_id, slot_key),
  KEY idx_demand_score_slots_task (task_id),
  KEY idx_demand_score_slots_evaluator (evaluator_user_id, status),
  KEY idx_demand_score_slots_evaluatee (evaluatee_user_id),
  KEY idx_demand_score_slots_type (slot_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS demand_score_records (
  id BIGINT NOT NULL AUTO_INCREMENT,
  slot_id BIGINT NOT NULL,
  task_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  demand_id VARCHAR(64) NOT NULL,
  evaluatee_user_id INT NOT NULL,
  evaluator_user_id INT NOT NULL,
  delivery_score DECIMAL(5,2) NOT NULL,
  collaboration_score DECIMAL(5,2) NOT NULL,
  responsibility_score DECIMAL(5,2) NOT NULL,
  weighted_score DECIMAL(5,2) NOT NULL,
  comment TEXT NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_demand_score_records_slot (slot_id),
  KEY idx_demand_score_records_task (task_id),
  KEY idx_demand_score_records_subject (subject_id),
  KEY idx_demand_score_records_evaluator (evaluator_user_id),
  KEY idx_demand_score_records_evaluatee (evaluatee_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'demand.score.view', '需求评分', 'work', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'demand.score.view'
);

INSERT INTO permissions (permission_code, permission_name, module_key, enabled)
SELECT 'demand.score.result.view', '查看需求评分结果', 'work', 1
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_code = 'demand.score.result.view'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, target.id
FROM role_permissions rp
INNER JOIN permissions source ON source.id = rp.permission_id AND source.permission_code = 'demand.view'
INNER JOIN permissions target ON target.permission_code = 'demand.score.view'
LEFT JOIN role_permissions exists_rp
  ON exists_rp.role_id = rp.role_id
 AND exists_rp.permission_id = target.id
WHERE exists_rp.role_id IS NULL;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
INNER JOIN permissions p ON p.permission_code = 'demand.score.result.view'
LEFT JOIN role_permissions rp
  ON rp.role_id = r.id
 AND rp.permission_id = p.id
WHERE rp.role_id IS NULL
  AND UPPER(COALESCE(r.role_key, '')) IN ('SUPER_ADMIN');

INSERT INTO menu_visibility_rules (menu_key, scope_type, department_id, department_ids_json, role_keys_json)
SELECT '/demand-scores', 'ALL', NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM menu_visibility_rules WHERE menu_key = '/demand-scores'
);

INSERT INTO menu_visibility_rules (menu_key, scope_type, department_id, department_ids_json, role_keys_json)
SELECT '/demand-score-results', 'ROLE', NULL, NULL, JSON_ARRAY('SUPER_ADMIN')
WHERE NOT EXISTS (
  SELECT 1 FROM menu_visibility_rules WHERE menu_key = '/demand-score-results'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'demand_participant_role', 'PROJECT_MANAGER', '项目管理', 15, 1, NULL, '项目管理角色，仅允许单人', JSON_OBJECT('single_select', true, 'exclude_from_scoring_subject', true)
WHERE NOT EXISTS (
  SELECT 1
  FROM config_dict_items
  WHERE type_key = 'demand_participant_role'
    AND item_code = 'PROJECT_MANAGER'
);

UPDATE config_dict_items
SET item_name = '项目管理',
    sort_order = 15,
    enabled = 1,
    remark = '项目管理角色，仅允许单人',
    extra_json = JSON_OBJECT('single_select', true, 'exclude_from_scoring_subject', true)
WHERE type_key = 'demand_participant_role'
  AND item_code = 'PROJECT_MANAGER';
