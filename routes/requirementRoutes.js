const express = require('express')

const authMiddleware = require('../middleware/auth')
const businessLineScope = require('../middleware/businessLineScope')
const {
  listRequirements,
  getRequirementById,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  updateRequirementStatus,
  updateRequirementStage,
  updateRequirementAssignee,
  updateRequirementHours,
} = require('../controllers/requirementController')

const router = express.Router()

router.use(authMiddleware)
router.use(businessLineScope)

router.get('/', authMiddleware.requirePermission('requirement.view'), listRequirements)
router.get('/:id', authMiddleware.requirePermission('requirement.view'), getRequirementById)
router.post('/', authMiddleware.requirePermission('requirement.create'), createRequirement)
router.put('/:id', authMiddleware.requirePermission('requirement.edit'), updateRequirement)
router.delete('/:id', authMiddleware.requirePermission('requirement.edit'), deleteRequirement)
router.put('/:id/status', authMiddleware.requirePermission('requirement.transition'), updateRequirementStatus)
router.put('/:id/stage', authMiddleware.requirePermission('requirement.edit'), updateRequirementStage)
router.put('/:id/assignee', authMiddleware.requirePermission('requirement.edit'), updateRequirementAssignee)
router.put('/:id/hours', authMiddleware.requirePermission('requirement.edit'), updateRequirementHours)

module.exports = router
