const express = require('express')

const authMiddleware = require('../middleware/auth')
const businessLineScope = require('../middleware/businessLineScope')
const {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  listProjectMembers,
  addProjectMember,
  updateProjectMember,
  deleteProjectMember,
  listProjectActivityLogs,
} = require('../controllers/projectController')

const router = express.Router()

router.use(authMiddleware)
router.use(businessLineScope)

router.get('/', authMiddleware.requirePermission('project.view'), listProjects)
router.get('/:id', authMiddleware.requirePermission('project.view'), getProjectById)
router.post('/', authMiddleware.requirePermission('project.create'), createProject)
router.put('/:id', authMiddleware.requirePermission('project.edit'), updateProject)
router.delete('/:id', authMiddleware.requirePermission('project.delete'), deleteProject)

router.get('/:id/members', authMiddleware.requirePermission('project.view'), listProjectMembers)
router.post('/:id/members', authMiddleware.requirePermission('project.member.manage'), addProjectMember)
router.put('/:id/members/:memberId', authMiddleware.requirePermission('project.member.manage'), updateProjectMember)
router.delete('/:id/members/:memberId', authMiddleware.requirePermission('project.member.manage'), deleteProjectMember)

router.get('/:id/activity-logs', authMiddleware.requirePermission('project.view'), listProjectActivityLogs)

module.exports = router
