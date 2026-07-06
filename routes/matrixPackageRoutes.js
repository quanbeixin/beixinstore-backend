const express = require('express')
const authMiddleware = require('../middleware/auth')
const {
  createMatrixPackage,
  deleteMatrixPackage,
  listMatrixPackages,
  updateMatrixPackage,
} = require('../controllers/matrixPackageController')

const router = express.Router()

router.use(authMiddleware)

router.get('/', authMiddleware.requirePermission('demand.view'), listMatrixPackages)
router.post('/', authMiddleware.requirePermission('demand.manage'), createMatrixPackage)
router.put('/:id', authMiddleware.requirePermission('demand.manage'), updateMatrixPackage)
router.delete('/:id', authMiddleware.requirePermission('demand.manage'), deleteMatrixPackage)

module.exports = router
