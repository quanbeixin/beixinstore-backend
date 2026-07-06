const express = require('express')
const authMiddleware = require('../middleware/auth')
const {
  createMatrixPackage,
  confirmMatrixPackageSideNote,
  deleteMatrixPackage,
  getMatrixPackage,
  listMatrixPackageSideNotes,
  listMatrixPackages,
  saveMatrixPackageSideNotes,
  updateMatrixPackage,
} = require('../controllers/matrixPackageController')

const router = express.Router()

router.use(authMiddleware)

router.get('/', authMiddleware.requirePermission('demand.view'), listMatrixPackages)
router.get('/:id', authMiddleware.requirePermission('demand.view'), getMatrixPackage)
router.get('/:id/side-notes', authMiddleware.requirePermission('demand.view'), listMatrixPackageSideNotes)
router.put('/:id/side-notes', authMiddleware.requirePermission('demand.manage'), saveMatrixPackageSideNotes)
router.post('/:id/side-notes/:noteType/confirm', authMiddleware.requirePermission('demand.manage'), confirmMatrixPackageSideNote)
router.post('/', authMiddleware.requirePermission('demand.manage'), createMatrixPackage)
router.put('/:id', authMiddleware.requirePermission('demand.manage'), updateMatrixPackage)
router.delete('/:id', authMiddleware.requirePermission('demand.manage'), deleteMatrixPackage)

module.exports = router
