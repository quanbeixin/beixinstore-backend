const express = require('express')
const authMiddleware = require('../middleware/auth')
const {
  createMatrixPackage,
  confirmMatrixPackageSideNote,
  completeMatrixPackageProduction,
  deleteMatrixPackage,
  downloadMatrixPackageDataSafetyFile,
  getMatrixPackage,
  remindMatrixPackageProductionNode,
  remindMatrixPackageSideNote,
  listMatrixPackageProductionNodes,
  getMatrixPackageSideNoteUploadPolicy,
  listMatrixPackageSideNotes,
  listMatrixPackages,
  patchMatrixPackageSideNoteFields,
  saveMatrixPackageSideNotes,
  syncMatrixPackageDevopsMeta,
  updateMatrixPackageProductionNode,
  updateMatrixPackage,
} = require('../controllers/matrixPackageController')

const router = express.Router()

router.use(authMiddleware)

router.get('/', authMiddleware.requirePermission('matrix_package.view'), listMatrixPackages)
router.get('/:id', authMiddleware.requirePermission('matrix_package.view'), getMatrixPackage)
router.get('/:id/production-nodes', authMiddleware.requirePermission('matrix_package.view'), listMatrixPackageProductionNodes)
router.post('/:id/complete-production', authMiddleware.requirePermission('matrix_package.manage'), completeMatrixPackageProduction)
router.put('/:id/production-nodes/:nodeCode', authMiddleware.requirePermission('matrix_package.manage'), updateMatrixPackageProductionNode)
router.post('/:id/production-nodes/:nodeCode/remind', authMiddleware.requirePermission('matrix_package.view'), remindMatrixPackageProductionNode)
router.get('/:id/side-notes', authMiddleware.requirePermission('matrix_package.view'), listMatrixPackageSideNotes)
router.get('/:id/data-safety-file', authMiddleware.requirePermission('matrix_package.view'), downloadMatrixPackageDataSafetyFile)
router.put('/:id/side-notes', authMiddleware.requirePermission('matrix_package.manage'), saveMatrixPackageSideNotes)
router.patch('/:id/side-notes/:noteType/fields', authMiddleware.requirePermission('matrix_package.manage'), patchMatrixPackageSideNoteFields)
router.post('/:id/side-notes/upload-policy', authMiddleware.requirePermission('matrix_package.manage'), getMatrixPackageSideNoteUploadPolicy)
router.post('/:id/side-notes/:noteType/confirm', authMiddleware.requirePermission('matrix_package.manage'), confirmMatrixPackageSideNote)
router.post('/:id/side-notes/:noteType/remind', authMiddleware.requirePermission('matrix_package.view'), remindMatrixPackageSideNote)
router.post('/:id/devops-meta-sync', authMiddleware.requirePermission('matrix_package.manage'), syncMatrixPackageDevopsMeta)
router.post('/', authMiddleware.requirePermission('matrix_package.manage'), createMatrixPackage)
router.put('/:id', authMiddleware.requirePermission('matrix_package.manage'), updateMatrixPackage)
router.delete('/:id', authMiddleware.requirePermission('matrix_package.manage'), deleteMatrixPackage)

module.exports = router
