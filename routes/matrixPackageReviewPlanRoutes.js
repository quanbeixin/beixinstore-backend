const express = require('express')
const authMiddleware = require('../middleware/auth')
const {
  listMatrixPackageReviewPlans,
  saveMatrixPackageReviewPlan,
  transitionMatrixPackageReviewPlan,
} = require('../controllers/matrixPackageReviewPlanController')

const router = express.Router()

router.use(authMiddleware)

router.get('/', authMiddleware.requirePermission('demand.view'), listMatrixPackageReviewPlans)
router.put('/:packageId', authMiddleware.requirePermission('demand.manage'), saveMatrixPackageReviewPlan)
router.post('/:packageId/transition', authMiddleware.requirePermission('demand.manage'), transitionMatrixPackageReviewPlan)

module.exports = router
