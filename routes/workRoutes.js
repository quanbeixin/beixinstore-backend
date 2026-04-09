const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  listBugs,
  getBugDetail,
  createBug,
  updateBug,
  deleteBug,
  startBug,
  fixBug,
  verifyBug,
  reopenBug,
  rejectBug,
  listBugAssignees,
  getDemandBugStats,
  listDemandBugs,
  getBugAttachmentPolicy,
  createBugAttachment,
  deleteBugAttachment,
} = require('../controllers/bugController')
const {
  listWorkItemTypes,
  listDemandPhaseTypes,
  listProjectTemplatePhaseTypes,
  listDemandWorkflowNodeOptions,
  listWorkflowAssignees,
  createWorkItemType,
  listProjectTemplates,
  getProjectTemplateById,
  createProjectTemplate,
  updateProjectTemplate,
  getEfficiencyFactorSettings,
  updateEfficiencyFactorSettings,
  listDemands,
  getDemandById,
  listDemandMembers,
  addDemandMember,
  removeDemandMember,
  listDemandCommunications,
  createDemandCommunication,
  deleteDemandCommunication,
  createDemand,
  updateDemand,
  deleteDemand,
  listArchivedDemands,
  restoreArchivedDemand,
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
  updateLogDailyEntry,
  updateLogOwnerEstimate,
  getInsightFilterOptions,
  getDepartmentEfficiencyRanking,
  getDepartmentEfficiencyDetail,
  getDemandInsight,
  getMemberInsight,
  getMemberEfficiencyDetail,
  initDemandWorkflowInstance,
  getDemandWorkflow,
  assignDemandWorkflowCurrentNode,
  assignDemandWorkflowNode,
  submitDemandWorkflowCurrentNode,
  submitDemandWorkflowNode,
  rejectDemandWorkflowCurrentNode,
  rejectDemandWorkflowNode,
  forceCompleteDemandWorkflowCurrentNode,
  forceCompleteDemandWorkflowNode,
  updateDemandWorkflowNodeHours,
  updateDemandWorkflowTaskHours,
  listDemandWorkflowTaskCollaborators,
  addDemandWorkflowTaskCollaborator,
  removeDemandWorkflowTaskCollaborator,
  replaceDemandWorkflowLatestTemplate,
  getMyWorkbench,
  getMyWeeklyReport,
  sendMyWeeklyReport,
  getMyAssignedItems,
  updateAssignedLog,
  getOwnerWorkbench,
  getMorningStandupBoard,
  getMorningStandupWeeklyProgress,
  getMorningStandupWeeklyCompletedSummary,
  triggerMorningDailyReportNotification,
  sendNoFillReminders,
} = require('../controllers/workController')
const { getHumanGantt } = require('../controllers/humanGanttController')

router.use(authMiddleware)

router.get('/bugs/assignees', authMiddleware.requirePermission('bug.view'), listBugAssignees)
router.get('/bugs', authMiddleware.requirePermission('bug.view'), listBugs)
router.get('/bugs/:id', authMiddleware.requirePermission('bug.view'), getBugDetail)
router.post('/bugs', authMiddleware.requirePermission('bug.create'), createBug)
router.put('/bugs/:id', authMiddleware.requirePermission('bug.update'), updateBug)
router.delete('/bugs/:id', authMiddleware.requirePermission('bug.delete'), deleteBug)
router.post('/bugs/:id/start', authMiddleware.requirePermission('bug.transition'), startBug)
router.post('/bugs/:id/fix', authMiddleware.requirePermission('bug.transition'), fixBug)
router.post('/bugs/:id/verify', authMiddleware.requirePermission('bug.transition'), verifyBug)
router.post('/bugs/:id/reopen', authMiddleware.requirePermission('bug.transition'), reopenBug)
router.post('/bugs/:id/reject', authMiddleware.requirePermission('bug.transition'), rejectBug)
router.post('/bugs/:id/attachments/policy', authMiddleware.requirePermission('bug.update'), getBugAttachmentPolicy)
router.post('/bugs/:id/attachments', authMiddleware.requirePermission('bug.update'), createBugAttachment)
router.delete(
  '/bugs/:id/attachments/:attachmentId',
  authMiddleware.requirePermission('bug.update'),
  deleteBugAttachment,
)

router.get(
  '/item-types',
  authMiddleware.requireAnyPermission(['worklog.view.self', 'demand.view']),
  listWorkItemTypes,
)
router.get(
  '/phase-types',
  authMiddleware.requireAnyPermission(['worklog.view.self', 'demand.view', 'project.template.view']),
  listDemandPhaseTypes,
)
router.get(
  '/project-template-phase-types',
  authMiddleware.requirePermission('project.template.view'),
  listProjectTemplatePhaseTypes,
)
router.get(
  '/workflow/assignees',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  listWorkflowAssignees,
)
router.post('/item-types', authMiddleware.requirePermission('demand.manage'), createWorkItemType)
router.get(
  '/project-templates',
  authMiddleware.requireAnyPermission(['project.template.view', 'demand.create']),
  listProjectTemplates,
)
router.get(
  '/project-templates/:id',
  authMiddleware.requireAnyPermission(['project.template.view', 'demand.create']),
  getProjectTemplateById,
)
router.post('/project-templates', authMiddleware.requirePermission('project.template.manage'), createProjectTemplate)
router.put('/project-templates/:id', authMiddleware.requirePermission('project.template.manage'), updateProjectTemplate)
router.get('/efficiency-factor-settings', getEfficiencyFactorSettings)
router.put('/efficiency-factor-settings', updateEfficiencyFactorSettings)

router.get('/demands', authMiddleware.requirePermission('demand.view'), listDemands)
router.get('/demands/:id', authMiddleware.requirePermission('demand.view'), getDemandById)
router.get('/demands/:id/workflow/node-options', authMiddleware.requirePermission('demand.view'), listDemandWorkflowNodeOptions)
router.get('/demands/:id/bug-stats', authMiddleware.requireAnyPermission(['demand.view', 'bug.view']), getDemandBugStats)
router.get('/demands/:id/bugs', authMiddleware.requireAnyPermission(['demand.view', 'bug.view']), listDemandBugs)
router.get('/demands/:id/members', authMiddleware.requirePermission('demand.view'), listDemandMembers)
router.get('/demands/:id/communications', authMiddleware.requirePermission('demand.view'), listDemandCommunications)
router.post('/demands/:id/communications', authMiddleware.requirePermission('demand.view'), createDemandCommunication)
router.delete(
  '/demands/:id/communications/:communicationId',
  authMiddleware.requirePermission('demand.view'),
  deleteDemandCommunication,
)
router.post('/demands/:id/members', authMiddleware.requirePermission('demand.manage'), addDemandMember)
router.delete(
  '/demands/:id/members/:userId',
  authMiddleware.requirePermission('demand.manage'),
  removeDemandMember,
)
router.post('/demands', authMiddleware.requirePermission('demand.create'), createDemand)
router.put('/demands/:id', authMiddleware.requirePermission('demand.view'), updateDemand)
router.delete('/demands/:id', authMiddleware.requirePermission('demand.view'), deleteDemand)
router.get('/archive/demands', authMiddleware.requirePermission('archive.view'), listArchivedDemands)
router.post('/archive/demands/:id/restore', authMiddleware.requirePermission('archive.manage'), restoreArchivedDemand)
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
  '/demands/:id/workflow/nodes/:nodeKey/submit',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  submitDemandWorkflowNode,
)
router.post(
  '/demands/:id/workflow/current/reject',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  rejectDemandWorkflowCurrentNode,
)
router.post(
  '/demands/:id/workflow/nodes/:nodeKey/reject',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  rejectDemandWorkflowNode,
)
router.post(
  '/demands/:id/workflow/current/force-complete',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  forceCompleteDemandWorkflowCurrentNode,
)
router.post(
  '/demands/:id/workflow/nodes/:nodeKey/force-complete',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  forceCompleteDemandWorkflowNode,
)
router.put(
  '/demands/:id/workflow/nodes/:nodeKey/hours',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  updateDemandWorkflowNodeHours,
)
router.put(
  '/demands/:id/workflow/tasks/:taskId/hours',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  updateDemandWorkflowTaskHours,
)
router.get(
  '/demands/:id/workflow/tasks/:taskId/collaborators',
  authMiddleware.requirePermission('demand.view'),
  listDemandWorkflowTaskCollaborators,
)
router.post(
  '/demands/:id/workflow/tasks/:taskId/collaborators',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  addDemandWorkflowTaskCollaborator,
)
router.delete(
  '/demands/:id/workflow/tasks/:taskId/collaborators/:userId',
  authMiddleware.requireAnyPermission(['demand.manage', 'demand.workflow.manage']),
  removeDemandWorkflowTaskCollaborator,
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
  '/logs/:id/daily-entries/:entryId',
  authMiddleware.requirePermission('worklog.update.self'),
  updateLogDailyEntry,
)
router.put(
  '/logs/:id/owner-estimate',
  authMiddleware.requireAnyPermission(['workbench.view.owner', 'workbench.view.self']),
  updateLogOwnerEstimate,
)

router.get('/insight/filters', getInsightFilterOptions)
router.get('/insight/department-ranking', getDepartmentEfficiencyRanking)
router.get('/insight/department-detail', getDepartmentEfficiencyDetail)
router.get('/insight/demand', getDemandInsight)
router.get('/insight/member', getMemberInsight)
router.get('/insight/member-detail', getMemberEfficiencyDetail)
router.get('/human-gantt', getHumanGantt)

router.get('/workbench/me', authMiddleware.requirePermission('workbench.view.self'), getMyWorkbench)
router.get('/workbench/me/weekly-report', authMiddleware.requirePermission('workbench.view.self'), getMyWeeklyReport)
router.post('/workbench/me/weekly-report/send', authMiddleware.requirePermission('workbench.view.self'), sendMyWeeklyReport)
router.get('/my-assigned-items', authMiddleware.requirePermission('worklog.view.self'), getMyAssignedItems)
router.put('/my-assigned-items/:id', authMiddleware.requirePermission('worklog.view.self'), updateAssignedLog)
router.get('/workbench/morning', getMorningStandupBoard)
router.get('/workbench/morning/weekly-progress', getMorningStandupWeeklyProgress)
router.get('/workbench/morning/weekly-completed', getMorningStandupWeeklyCompletedSummary)
router.post('/workbench/morning/daily-report/notify', triggerMorningDailyReportNotification)
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
