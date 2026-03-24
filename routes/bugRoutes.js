const express = require('express')

const authMiddleware = require('../middleware/auth')
const businessLineScope = require('../middleware/businessLineScope')
const {
  listBugs,
  getBugById,
  createBug,
  updateBug,
  deleteBug,
  updateBugStatus,
  updateBugStage,
  updateBugAssignee,
  updateBugHours,
} = require('../controllers/bugController')

const router = express.Router()

router.use(authMiddleware)
router.use(businessLineScope)

router.get('/', authMiddleware.requirePermission('bug.view'), listBugs)
router.get('/:id', authMiddleware.requirePermission('bug.view'), getBugById)
router.post('/', authMiddleware.requirePermission('bug.create'), createBug)
router.put('/:id', authMiddleware.requirePermission('bug.edit'), updateBug)
router.delete('/:id', authMiddleware.requirePermission('bug.edit'), deleteBug)
router.put('/:id/status', authMiddleware.requirePermission('bug.transition'), updateBugStatus)
router.put('/:id/stage', authMiddleware.requirePermission('bug.edit'), updateBugStage)
router.put('/:id/assignee', authMiddleware.requirePermission('bug.edit'), updateBugAssignee)
router.put('/:id/hours', authMiddleware.requirePermission('bug.edit'), updateBugHours)

module.exports = router
