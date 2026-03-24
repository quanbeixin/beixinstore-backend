const express = require('express')

const authMiddleware = require('../middleware/auth')
const businessLineScope = require('../middleware/businessLineScope')
const {
  getProjectStatsOverview,
  getProjectStatsByProject,
  getProjectStatsByMember,
} = require('../controllers/projectStatsController')

const router = express.Router()

router.use(authMiddleware)
router.use(businessLineScope)

router.get('/overview', authMiddleware.requirePermission('project.stats.view'), getProjectStatsOverview)
router.get('/projects', authMiddleware.requirePermission('project.stats.view'), getProjectStatsByProject)
router.get('/members', authMiddleware.requirePermission('project.stats.view'), getProjectStatsByMember)

module.exports = router
