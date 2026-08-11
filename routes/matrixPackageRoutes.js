const express = require('express')
const authMiddleware = require('../middleware/auth')
const {
  createMatrixPackage,
  confirmMatrixPackageSideNote,
  completeMatrixPackageProduction,
  deleteMatrixPackage,
  downloadMatrixPackageDataSafetyFile,
  getMatrixPackage,
  getMatrixPackageDeliveryPlatformOverview,
  listMatrixPackageDeliveryPlatforms,
  remindMatrixPackageProductionNode,
  remindMatrixPackageSideNote,
  listMatrixPackageProductionNodes,
  getMatrixPackageSideNoteUploadPolicy,
  listMatrixPackageSideNotes,
  listMatrixPackages,
  patchMatrixPackageSideNoteFields,
  saveMatrixPackageSideNotes,
  saveMatrixPackageDeliveryPlatforms,
  syncMatrixPackageDevopsMeta,
  syncMatrixPackageGooglePlayMetadata,
  updateMatrixPackageProductionNode,
  updateMatrixPackage,
} = require('../controllers/matrixPackageController')

const router = express.Router()

router.use(authMiddleware)

router.get('/', authMiddleware.requirePermission('matrix_package.view'), listMatrixPackages)
router.get('/delivery-platform-overview', authMiddleware.requirePermission('matrix_package.view'), getMatrixPackageDeliveryPlatformOverview)
router.get('/:id', authMiddleware.requirePermission('matrix_package.view'), getMatrixPackage)
router.get('/:id/delivery-platforms', authMiddleware.requirePermission('matrix_package.view'), listMatrixPackageDeliveryPlatforms)
router.get('/:id/production-nodes', authMiddleware.requirePermission('matrix_package.view'), listMatrixPackageProductionNodes)
router.post('/:id/complete-production', authMiddleware.requirePermission('matrix_package.manage'), completeMatrixPackageProduction)
router.put('/:id/production-nodes/:nodeCode', authMiddleware.requirePermission('matrix_package.manage'), updateMatrixPackageProductionNode)
router.post('/:id/production-nodes/:nodeCode/remind', authMiddleware.requirePermission('matrix_package.view'), remindMatrixPackageProductionNode)
router.get('/:id/side-notes', authMiddleware.requirePermission('matrix_package.view'), listMatrixPackageSideNotes)
router.get('/:id/data-safety-file', authMiddleware.requirePermission('matrix_package.view'), downloadMatrixPackageDataSafetyFile)
router.put('/:id/side-notes', authMiddleware.requirePermission('matrix_package.manage'), saveMatrixPackageSideNotes)
router.put('/:id/delivery-platforms', authMiddleware.requirePermission('matrix_package.manage'), saveMatrixPackageDeliveryPlatforms)
router.patch('/:id/side-notes/:noteType/fields', authMiddleware.requirePermission('matrix_package.manage'), patchMatrixPackageSideNoteFields)
router.post('/:id/side-notes/upload-policy', authMiddleware.requirePermission('matrix_package.manage'), getMatrixPackageSideNoteUploadPolicy)
router.post('/:id/side-notes/:noteType/confirm', authMiddleware.requirePermission('matrix_package.manage'), confirmMatrixPackageSideNote)
router.post('/:id/side-notes/:noteType/remind', authMiddleware.requirePermission('matrix_package.view'), remindMatrixPackageSideNote)
router.post('/:id/devops-meta-sync', authMiddleware.requirePermission('matrix_package.manage'), syncMatrixPackageDevopsMeta)
router.post('/:id/google-play-metadata-sync', authMiddleware.requirePermission('matrix_package.manage'), syncMatrixPackageGooglePlayMetadata)
router.post('/', authMiddleware.requirePermission('matrix_package.manage'), createMatrixPackage)
router.put('/:id', authMiddleware.requirePermission('matrix_package.manage'), updateMatrixPackage)
router.delete('/:id', authMiddleware.requirePermission('matrix_package.manage'), deleteMatrixPackage)

module.exports = router
