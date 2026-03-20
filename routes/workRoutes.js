const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  listWorkItemTypes,
  listDemandPhaseTypes,
  createWorkItemType,
  listDemands,
  createDemand,
  updateDemand,
  listLogs,
  createLog,
  updateLog,
  updateLogOwnerEstimate,
  getMyWorkbench,
  getOwnerWorkbench,
  sendNoFillReminders,
} = require('../controllers/workController')

router.use(authMiddleware)

router.get(
  '/item-types',
  authMiddleware.requireAnyPermission(['worklog.view.self', 'demand.view']),
  listWorkItemTypes,
)
router.get(
  '/phase-types',
  authMiddleware.requireAnyPermission(['worklog.view.self', 'demand.view']),
  listDemandPhaseTypes,
)
router.post('/item-types', authMiddleware.requirePermission('demand.manage'), createWorkItemType)

router.get('/demands', authMiddleware.requirePermission('demand.view'), listDemands)
router.post('/demands', authMiddleware.requirePermission('demand.manage'), createDemand)
router.put('/demands/:id', authMiddleware.requirePermission('demand.manage'), updateDemand)

router.get('/logs', authMiddleware.requirePermission('worklog.view.self'), listLogs)
router.post('/logs', authMiddleware.requirePermission('worklog.create'), createLog)
router.put('/logs/:id', authMiddleware.requirePermission('worklog.update.self'), updateLog)
router.put(
  '/logs/:id/owner-estimate',
  authMiddleware.requireAnyPermission(['workbench.view.owner', 'workbench.view.self']),
  updateLogOwnerEstimate,
)

router.get('/workbench/me', authMiddleware.requirePermission('workbench.view.self'), getMyWorkbench)
router.get(
  '/workbench/owner',
  authMiddleware.requireAnyPermission(['workbench.view.owner', 'workbench.view.self']),
  getOwnerWorkbench,
)
router.post(
  '/reminders/no-fill',
  authMiddleware.requireAnyPermission(['workbench.view.owner', 'workbench.view.self']),
  sendNoFillReminders,
)

module.exports = router
