const express = require('express')

const authMiddleware = require('../middleware/auth')
const {
  getAllFeedback,
  getFeedbackById,
  createFeedback,
  updateFeedback,
  deleteFeedback,
  updateFeedbackStatus,
  batchUpdateStatus,
  batchImport,
  analyzeUnprocessed,
  analyzeSingle,
} = require('../controllers/userFeedbackController')

const router = express.Router()

router.use(authMiddleware)
router.use((req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    res.set('Surrogate-Control', 'no-store')
  }
  next()
})

router.get('/', authMiddleware.requirePermission('feedback.view'), getAllFeedback)
router.get('/:id', authMiddleware.requirePermission('feedback.view'), getFeedbackById)
router.post('/', authMiddleware.requirePermission('feedback.manage'), createFeedback)
router.put('/:id', authMiddleware.requirePermission('feedback.manage'), updateFeedback)
router.delete('/:id', authMiddleware.requirePermission('feedback.manage'), deleteFeedback)

router.patch('/:id/status', authMiddleware.requirePermission('feedback.manage'), updateFeedbackStatus)
router.post('/batch/status', authMiddleware.requirePermission('feedback.manage'), batchUpdateStatus)
router.post('/batch/import', authMiddleware.requirePermission('feedback.manage'), batchImport)

router.post('/analyze/unprocessed', authMiddleware.requirePermission('feedback.ai.analyze'), analyzeUnprocessed)
router.post('/:id/analyze', authMiddleware.requirePermission('feedback.ai.analyze'), analyzeSingle)

module.exports = router
