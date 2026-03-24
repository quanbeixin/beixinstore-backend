CREATE TABLE IF NOT EXISTS pm_user_business_lines (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  project_id INT NOT NULL,
  created_by INT DEFAULT NULL,
  updated_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pm_user_business_lines_user_id (user_id),
  KEY idx_pm_user_business_lines_project_id (project_id),
  CONSTRAINT fk_pm_user_business_lines_user_id
    FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_pm_user_business_lines_project_id
    FOREIGN KEY (project_id) REFERENCES pm_projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
