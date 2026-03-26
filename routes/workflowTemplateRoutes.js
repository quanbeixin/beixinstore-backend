const express = require('express')

const authMiddleware = require('../middleware/auth')
const businessLineScope = require('../middleware/businessLineScope')
const {
  listTemplates,
  getTemplateDetail,
  createTemplate,
  updateTemplateNodes,
  publishTemplate,
  setDefaultTemplate,
} = require('../controllers/workflowTemplateController')

const router = express.Router()

router.use(authMiddleware)
router.use(businessLineScope)

router.get('/', authMiddleware.requirePermission('demand.workflow.template.view'), listTemplates)
router.get('/:id', authMiddleware.requirePermission('demand.workflow.template.view'), getTemplateDetail)
router.post('/', authMiddleware.requirePermission('demand.workflow.template.edit'), createTemplate)
router.put('/:id', authMiddleware.requirePermission('demand.workflow.template.edit'), updateTemplateNodes)
router.post('/:id/publish', authMiddleware.requirePermission('demand.workflow.template.publish'), publishTemplate)
router.post('/:id/set-default', authMiddleware.requirePermission('demand.workflow.template.publish'), setDefaultTemplate)

module.exports = router
