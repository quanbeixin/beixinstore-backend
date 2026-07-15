const express = require('express')
const authMiddleware = require('../middleware/auth')
const {
  listMatrixPackageReviewPlans,
  saveMatrixPackageReviewPlan,
  transitionMatrixPackageReviewPlan,
} = require('../controllers/matrixPackageReviewPlanController')

const router = express.Router()

router.use(authMiddleware)

router.get('/', authMiddleware.requirePermission('matrix_package.view'), listMatrixPackageReviewPlans)
router.put('/:packageId', authMiddleware.requirePermission('matrix_package.manage'), saveMatrixPackageReviewPlan)
router.post('/:packageId/transition', authMiddleware.requirePermission('matrix_package.manage'), transitionMatrixPackageReviewPlan)

module.exports = router
