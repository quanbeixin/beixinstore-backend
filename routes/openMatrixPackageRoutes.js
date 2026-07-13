const express = require('express')
const {
  listOpenMatrixPackages,
} = require('../controllers/openMatrixPackageController')

const router = express.Router()

router.get('/matrix-packages', listOpenMatrixPackages)

module.exports = router
