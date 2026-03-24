const pool = require('../utils/db')

let initialized = false

function isLegacyBootstrapEnabled() {
  return String(process.env.ENABLE_LEGACY_BOOTSTRAP || 'false').trim().toLowerCase() === 'true'
}

const PROJECT_PERMISSIONS = [
  ['project.view', '查看项目', 'project_management'],
  ['project.create', '创建项目', 'project_management'],
  ['project.edit', '编辑项目', 'project_management'],
  ['project.delete', '删除项目', 'project_management'],
  ['project.member.manage', '管理项目成员', 'project_management'],
  ['requirement.view', '查看需求', 'project_management'],
  ['requirement.create', '创建需求', 'project_management'],
  ['requirement.edit', '编辑需求', 'project_management'],
  ['requirement.transition', '流转需求状态', 'project_management'],
  ['bug.view', '查看缺陷', 'project_management'],
  ['bug.create', '创建缺陷', 'project_management'],
  ['bug.edit', '编辑缺陷', 'project_management'],
  ['bug.transition', '流转缺陷状态', 'project_management'],
  ['project.stats.view', '查看项目统计', 'project_management'],
]

async function ensureProjectTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pm_projects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      project_code VARCHAR(50) DEFAULT NULL,
      description TEXT DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
      owner_user_id INT DEFAULT NULL,
      start_date DATE DEFAULT NULL,
      end_date DATE DEFAULT NULL,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_by INT DEFAULT NULL,
      updated_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pm_projects_name (name),
      UNIQUE KEY uk_pm_projects_code (project_code),
      KEY idx_pm_projects_status (status),
      KEY idx_pm_projects_owner_user_id (owner_user_id),
      KEY idx_pm_projects_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pm_project_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      project_role VARCHAR(20) NOT NULL DEFAULT 'DEV',
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by INT DEFAULT NULL,
      updated_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pm_project_members_project_user (project_id, user_id),
      KEY idx_pm_project_members_user_id (user_id),
      KEY idx_pm_project_members_project_role (project_role),
      CONSTRAINT fk_pm_project_members_project_id
        FOREIGN KEY (project_id) REFERENCES pm_projects(id),
      CONSTRAINT fk_pm_project_members_user_id
        FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pm_requirements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT DEFAULT NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
      status VARCHAR(20) NOT NULL DEFAULT 'TODO',
      stage VARCHAR(20) NOT NULL DEFAULT 'REQUIREMENT',
      assignee_user_id INT DEFAULT NULL,
      estimated_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
      actual_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
      start_date DATE DEFAULT NULL,
      due_date DATE DEFAULT NULL,
      completed_at DATETIME DEFAULT NULL,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_by INT DEFAULT NULL,
      updated_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_pm_requirements_project_id (project_id),
      KEY idx_pm_requirements_status (status),
      KEY idx_pm_requirements_stage (stage),
      KEY idx_pm_requirements_priority (priority),
      KEY idx_pm_requirements_assignee_user_id (assignee_user_id),
      CONSTRAINT fk_pm_requirements_project_id
        FOREIGN KEY (project_id) REFERENCES pm_projects(id),
      CONSTRAINT fk_pm_requirements_assignee_user_id
        FOREIGN KEY (assignee_user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pm_bugs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      requirement_id INT DEFAULT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT DEFAULT NULL,
      reproduce_steps TEXT DEFAULT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
      status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
      stage VARCHAR(20) NOT NULL DEFAULT 'DEVELOPMENT',
      assignee_user_id INT DEFAULT NULL,
      estimated_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
      actual_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
      due_date DATE DEFAULT NULL,
      resolved_at DATETIME DEFAULT NULL,
      verified_at DATETIME DEFAULT NULL,
      closed_at DATETIME DEFAULT NULL,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_by INT DEFAULT NULL,
      updated_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_pm_bugs_project_id (project_id),
      KEY idx_pm_bugs_requirement_id (requirement_id),
      KEY idx_pm_bugs_status (status),
      KEY idx_pm_bugs_severity (severity),
      KEY idx_pm_bugs_assignee_user_id (assignee_user_id),
      CONSTRAINT fk_pm_bugs_project_id
        FOREIGN KEY (project_id) REFERENCES pm_projects(id),
      CONSTRAINT fk_pm_bugs_requirement_id
        FOREIGN KEY (requirement_id) REFERENCES pm_requirements(id),
      CONSTRAINT fk_pm_bugs_assignee_user_id
        FOREIGN KEY (assignee_user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pm_activity_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT DEFAULT NULL,
      requirement_id INT DEFAULT NULL,
      bug_id INT DEFAULT NULL,
      entity_type VARCHAR(20) NOT NULL,
      entity_id INT NOT NULL,
      action VARCHAR(50) NOT NULL,
      action_detail TEXT DEFAULT NULL,
      operator_user_id INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_pm_activity_logs_project_id (project_id),
      KEY idx_pm_activity_logs_requirement_id (requirement_id),
      KEY idx_pm_activity_logs_bug_id (bug_id),
      KEY idx_pm_activity_logs_entity (entity_type, entity_id),
      KEY idx_pm_activity_logs_operator_user_id (operator_user_id),
      CONSTRAINT fk_pm_activity_logs_project_id
        FOREIGN KEY (project_id) REFERENCES pm_projects(id),
      CONSTRAINT fk_pm_activity_logs_requirement_id
        FOREIGN KEY (requirement_id) REFERENCES pm_requirements(id),
      CONSTRAINT fk_pm_activity_logs_bug_id
        FOREIGN KEY (bug_id) REFERENCES pm_bugs(id),
      CONSTRAINT fk_pm_activity_logs_operator_user_id
        FOREIGN KEY (operator_user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

async function ensurePermissions() {
  for (const [permissionCode, permissionName, moduleKey] of PROJECT_PERMISSIONS) {
    await pool.query(
      `INSERT INTO permissions (permission_code, permission_name, module_key, enabled, name, description)
       VALUES (?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         permission_name = VALUES(permission_name),
         module_key = VALUES(module_key),
         enabled = VALUES(enabled),
         name = VALUES(name),
         description = VALUES(description)`,
      [permissionCode, permissionName, moduleKey, permissionName, permissionName],
    )
  }
}

async function ensureAdminRolePermissions() {
  const [roleRows] = await pool.query(
    `SELECT id, role_key
     FROM roles
     WHERE role_key IN ('ADMIN', 'SUPER_ADMIN')
     ORDER BY id ASC`,
  )

  if (roleRows.length === 0) return

  const [permissionRows] = await pool.query(
    `SELECT id, permission_code
     FROM permissions
     WHERE permission_code IN (${PROJECT_PERMISSIONS.map(() => '?').join(',')})
     ORDER BY id ASC`,
    PROJECT_PERMISSIONS.map((item) => item[0]),
  )

  const permissionIdByCode = new Map(permissionRows.map((row) => [String(row.permission_code), Number(row.id)]))
  const projectPermissionIds = PROJECT_PERMISSIONS.map((item) => permissionIdByCode.get(item[0])).filter((id) =>
    Number.isInteger(id),
  )

  for (const role of roleRows) {
    if (String(role.role_key || '').toUpperCase() !== 'ADMIN') continue
    for (const permissionId of projectPermissionIds) {
      await pool.query(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id)
         VALUES (?, ?)`,
        [Number(role.id), permissionId],
      )
    }
  }
}

async function initializeProjectManagementModule() {
  if (initialized) return
  if (!isLegacyBootstrapEnabled()) {
    console.log(
      'Project management bootstrap skipped. Use migrations first. Set ENABLE_LEGACY_BOOTSTRAP=true only for legacy compatibility.',
    )
    initialized = true
    return
  }
  await ensureProjectTables()
  await ensurePermissions()
  await ensureAdminRolePermissions()
  console.log('Project management legacy bootstrap completed')
  initialized = true
}

module.exports = {
  initializeProjectManagementModule,
  isLegacyBootstrapEnabled,
}
