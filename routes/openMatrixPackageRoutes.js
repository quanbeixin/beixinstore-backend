const express = require('express')
const {
  getOpenMatrixPackageUploadPolicy,
  listOpenMatrixPackages,
  updateOpenMatrixPackageFields,
  updateGooglePayCertificateContent,
} = require('../controllers/openMatrixPackageController')

const router = express.Router()

router.get('/matrix-packages', listOpenMatrixPackages)
router.post('/matrix-packages/upload-policy', getOpenMatrixPackageUploadPolicy)
router.post('/matrix-packages/update-fields', updateOpenMatrixPackageFields)
router.post('/matrix-packages/google-pay-certificate-content', updateGooglePayCertificateContent)

module.exports = router
