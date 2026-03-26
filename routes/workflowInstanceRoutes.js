const express = require('express')

const authMiddleware = require('../middleware/auth')
const businessLineScope = require('../middleware/businessLineScope')
const {
  getWorkflowByDemand,
  transitionWorkflow,
  getWorkflowLogs,
} = require('../controllers/workflowInstanceController')

const router = express.Router()

router.use(authMiddleware)
router.use(businessLineScope)

router.get('/logs', authMiddleware.requirePermission('demand.workflow.template.view'), getWorkflowLogs)
router.get('/:demandId', authMiddleware.requirePermission('demand.view'), getWorkflowByDemand)
router.post(
  '/:demandId/transition',
  authMiddleware.requirePermission('demand.workflow.instance.transition'),
  transitionWorkflow,
)

module.exports = router
