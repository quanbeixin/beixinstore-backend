CREATE TABLE IF NOT EXISTS pm_workflow_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '业务线ID(pm_projects.id)',
  template_name VARCHAR(100) NOT NULL,
  version_no INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/DISABLED',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT DEFAULT NULL,
  updated_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pm_wf_templates_project_version (project_id, version_no),
  KEY idx_pm_wf_templates_project_default (project_id, is_default),
  KEY idx_pm_wf_templates_project_status (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE pm_workflow_templates
  ADD COLUMN default_project_id INT
  GENERATED ALWAYS AS (CASE WHEN is_default = 1 THEN project_id ELSE NULL END) STORED;

CREATE UNIQUE INDEX uk_pm_wf_templates_single_default
  ON pm_workflow_templates (default_project_id);

CREATE TABLE IF NOT EXISTS pm_workflow_template_nodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL,
  node_key VARCHAR(50) NOT NULL,
  node_name VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  allow_return_to_keys JSON DEFAULT NULL COMMENT '允许回退到的node_key数组',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pm_wf_tpl_nodes_key (template_id, node_key),
  UNIQUE KEY uk_pm_wf_tpl_nodes_sort (template_id, sort_order),
  KEY idx_pm_wf_tpl_nodes_template_id (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pm_workflow_instances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  demand_id VARCHAR(64) NOT NULL COMMENT 'work_demands.id',
  project_id INT NOT NULL,
  template_id INT NOT NULL,
  template_version_no INT NOT NULL,
  current_node_key VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' COMMENT 'IN_PROGRESS/DONE/CANCELLED',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME DEFAULT NULL,
  created_by INT DEFAULT NULL,
  updated_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pm_wf_instances_demand_id (demand_id),
  KEY idx_pm_wf_instances_project_status (project_id, status),
  KEY idx_pm_wf_instances_template (template_id, template_version_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pm_workflow_instance_nodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  instance_id INT NOT NULL,
  node_key VARCHAR(50) NOT NULL,
  node_name_snapshot VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/IN_PROGRESS/DONE/SKIPPED/RETURNED',
  assignee_user_id INT DEFAULT NULL,
  due_at DATETIME DEFAULT NULL,
  started_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pm_wf_inst_nodes_key (instance_id, node_key),
  UNIQUE KEY uk_pm_wf_inst_nodes_sort (instance_id, sort_order),
  KEY idx_pm_wf_inst_nodes_instance (instance_id),
  KEY idx_pm_wf_inst_nodes_assignee (assignee_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pm_workflow_operation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  operator_user_id INT NOT NULL,
  entity_type VARCHAR(20) NOT NULL COMMENT 'TEMPLATE/INSTANCE',
  entity_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  detail TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pm_wf_op_logs_project_time (project_id, created_at),
  KEY idx_pm_wf_op_logs_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
