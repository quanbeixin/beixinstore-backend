const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  listWorkItemTypes,
  listDemandPhaseTypes,
  listWorkflowAssignees,
  createWorkItemType,
  listDemands,
  getDemandById,
  createDemand,
  updateDemand,
  deleteDemand,
  listArchivedDemands,
  purgeArchivedDemand,
  listLogs,
  createLog,
  createOwnerAssignedLog,
  updateLog,
  deleteLog,
  listLogDailyPlans,
  upsertLogDailyPlan,
  listLogDailyEntries,
  createLogDailyEntry,
  updateLogOwnerEstimate,
  getInsightFilterOptions,
  getDemandInsight,
  getMemberInsight,
  initDemandWorkflowInstance,
  getDemandWorkflow,
  assignDemandWorkflowCurrentNode,
  assignDemandWorkflowNode,
  submitDemandWorkflowCurrentNode,
  replaceDemandWorkflowLatestTemplate,
  getMyWorkbench,
  getMyWeeklyReport,
  getOwnerWorkbench,
  getMorningStandupBoard,
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
router.get(
  '/workflow/assignees',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  listWorkflowAssignees,
)
router.post('/item-types', authMiddleware.requirePermission('demand.manage'), createWorkItemType)

router.get('/demands', authMiddleware.requirePermission('demand.view'), listDemands)
router.get('/demands/:id', authMiddleware.requirePermission('demand.view'), getDemandById)
router.post('/demands', authMiddleware.requirePermission('demand.manage'), createDemand)
router.put('/demands/:id', authMiddleware.requirePermission('demand.view'), updateDemand)
router.delete('/demands/:id', authMiddleware.requirePermission('demand.view'), deleteDemand)
router.get('/archive/demands', authMiddleware.requirePermission('archive.view'), listArchivedDemands)
router.delete('/archive/demands/:id/purge', authMiddleware.requirePermission('archive.manage'), purgeArchivedDemand)
router.post('/demands/:id/workflow/init', authMiddleware.requirePermission('demand.manage'), initDemandWorkflowInstance)
router.get('/demands/:id/workflow', authMiddleware.requirePermission('demand.view'), getDemandWorkflow)
router.post(
  '/demands/:id/workflow/current/assign',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  assignDemandWorkflowCurrentNode,
)
router.post(
  '/demands/:id/workflow/nodes/:nodeKey/assign',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  assignDemandWorkflowNode,
)
router.post(
  '/demands/:id/workflow/current/submit',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  submitDemandWorkflowCurrentNode,
)
router.post(
  '/demands/:id/workflow/replace-latest',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  replaceDemandWorkflowLatestTemplate,
)

router.get('/logs', authMiddleware.requirePermission('worklog.view.self'), listLogs)
router.post('/logs', authMiddleware.requirePermission('worklog.create'), createLog)
router.post(
  '/logs/owner-assign',
  authMiddleware.requireAnyPermission(['workbench.view.owner', 'workbench.view.self']),
  createOwnerAssignedLog,
)
router.put('/logs/:id', authMiddleware.requirePermission('worklog.update.self'), updateLog)
router.delete('/logs/:id', authMiddleware.requirePermission('worklog.update.self'), deleteLog)
router.get('/logs/:id/daily-plans', authMiddleware.requirePermission('worklog.view.self'), listLogDailyPlans)
router.post('/logs/:id/daily-plan', authMiddleware.requirePermission('worklog.update.self'), upsertLogDailyPlan)
router.get('/logs/:id/daily-entries', authMiddleware.requirePermission('worklog.view.self'), listLogDailyEntries)
router.post('/logs/:id/daily-entries', authMiddleware.requirePermission('worklog.update.self'), createLogDailyEntry)
router.put(
  '/logs/:id/owner-estimate',
  authMiddleware.requireAnyPermission(['workbench.view.owner', 'workbench.view.self']),
  updateLogOwnerEstimate,
)

router.get('/insight/filters', getInsightFilterOptions)
router.get('/insight/demand', getDemandInsight)
router.get('/insight/member', getMemberInsight)

router.get('/workbench/me', authMiddleware.requirePermission('workbench.view.self'), getMyWorkbench)
router.get('/workbench/me/weekly-report', authMiddleware.requirePermission('workbench.view.self'), getMyWeeklyReport)
router.get('/workbench/morning', getMorningStandupBoard)
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
