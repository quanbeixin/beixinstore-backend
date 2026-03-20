const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  getOptions,
  createOption,
  updateOption,
  deleteOption,
} = require('../controllers/optionController')

router.use(authMiddleware)

router.get('/', authMiddleware.requirePermission('option.view'), getOptions)
router.post('/:type', authMiddleware.requirePermission('option.manage'), createOption)
router.put('/:type/:id', authMiddleware.requirePermission('option.manage'), updateOption)
router.delete('/:type/:id', authMiddleware.requirePermission('option.manage'), deleteOption)

module.exports = router
