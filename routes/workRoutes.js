const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  listWorkItemTypes,
  createWorkItemType,
  listDemandPhases,
  batchSaveDemandPhases,
  listDemands,
  createDemand,
  updateDemand,
  listLogs,
  createLog,
  updateLog,
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
router.post('/item-types', authMiddleware.requirePermission('demand.manage'), createWorkItemType)

router.get('/demands', authMiddleware.requirePermission('demand.view'), listDemands)
router.post('/demands', authMiddleware.requirePermission('demand.manage'), createDemand)
router.put('/demands/:id', authMiddleware.requirePermission('demand.manage'), updateDemand)
router.get(
  '/demands/:id/phases',
  authMiddleware.requireAnyPermission(['demand.phase.view', 'demand.view']),
  listDemandPhases,
)
router.put(
  '/demands/:id/phases/batch',
  authMiddleware.requirePermission('demand.phase.manage'),
  batchSaveDemandPhases,
)

router.get('/logs', authMiddleware.requirePermission('worklog.view.self'), listLogs)
router.post('/logs', authMiddleware.requirePermission('worklog.create'), createLog)
router.put('/logs/:id', authMiddleware.requirePermission('worklog.update.self'), updateLog)

router.get('/workbench/me', authMiddleware.requirePermission('workbench.view.self'), getMyWorkbench)
router.get('/workbench/owner', authMiddleware.requirePermission('workbench.view.owner'), getOwnerWorkbench)
router.post(
  '/reminders/no-fill',
  authMiddleware.requirePermission('workbench.view.owner'),
  sendNoFillReminders,
)

module.exports = router
