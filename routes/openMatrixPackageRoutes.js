const express = require('express')
const {
  listOpenMatrixPackages,
  updateGooglePayCertificateContent,
} = require('../controllers/openMatrixPackageController')

const router = express.Router()

router.get('/matrix-packages', listOpenMatrixPackages)
router.post('/matrix-packages/google-pay-certificate-content', updateGooglePayCertificateContent)

module.exports = router
