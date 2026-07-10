const express = require('express')
const authMiddleware = require('../middleware/auth')
const {
  createMatrixPackage,
  confirmMatrixPackageSideNote,
  deleteMatrixPackage,
  getMatrixPackage,
  remindMatrixPackageProductionNode,
  remindMatrixPackageSideNote,
  listMatrixPackageProductionNodes,
  getMatrixPackageSideNoteUploadPolicy,
  listMatrixPackageSideNotes,
  listMatrixPackages,
  saveMatrixPackageSideNotes,
  updateMatrixPackageProductionNode,
  updateMatrixPackage,
} = require('../controllers/matrixPackageController')

const router = express.Router()

router.use(authMiddleware)

router.get('/', authMiddleware.requirePermission('demand.view'), listMatrixPackages)
router.get('/:id', authMiddleware.requirePermission('demand.view'), getMatrixPackage)
router.get('/:id/production-nodes', authMiddleware.requirePermission('demand.view'), listMatrixPackageProductionNodes)
router.put('/:id/production-nodes/:nodeCode', authMiddleware.requirePermission('demand.manage'), updateMatrixPackageProductionNode)
router.post('/:id/production-nodes/:nodeCode/remind', authMiddleware.requirePermission('demand.manage'), remindMatrixPackageProductionNode)
router.get('/:id/side-notes', authMiddleware.requirePermission('demand.view'), listMatrixPackageSideNotes)
router.put('/:id/side-notes', authMiddleware.requirePermission('demand.manage'), saveMatrixPackageSideNotes)
router.post('/:id/side-notes/upload-policy', authMiddleware.requirePermission('demand.manage'), getMatrixPackageSideNoteUploadPolicy)
router.post('/:id/side-notes/:noteType/confirm', authMiddleware.requirePermission('demand.manage'), confirmMatrixPackageSideNote)
router.post('/:id/side-notes/:noteType/remind', authMiddleware.requirePermission('demand.manage'), remindMatrixPackageSideNote)
router.post('/', authMiddleware.requirePermission('demand.manage'), createMatrixPackage)
router.put('/:id', authMiddleware.requirePermission('demand.manage'), updateMatrixPackage)
router.delete('/:id', authMiddleware.requirePermission('demand.manage'), deleteMatrixPackage)

module.exports = router
