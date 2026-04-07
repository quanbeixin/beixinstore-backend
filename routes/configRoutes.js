const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  getDictTypes,
  createDictType,
  updateDictType,
  deleteDictType,
  getDictItems,
  createDictItem,
  updateDictItem,
  deleteDictItem,
} = require('../controllers/configDictController')

router.use(authMiddleware)

router.get('/dict/types', authMiddleware.requirePermission('dict.view'), getDictTypes)
router.post('/dict/types', authMiddleware.requirePermission('dict.manage'), createDictType)
router.put('/dict/types/:typeKey', authMiddleware.requirePermission('dict.manage'), updateDictType)
router.delete('/dict/types/:typeKey', authMiddleware.requirePermission('dict.manage'), deleteDictType)

router.get('/dict/items', authMiddleware.requirePermission('dict.view'), getDictItems)
router.post('/dict/items', authMiddleware.requirePermission('dict.manage'), createDictItem)
router.put('/dict/items/:id', authMiddleware.requirePermission('dict.manage'), updateDictItem)
router.delete('/dict/items/:id', authMiddleware.requirePermission('dict.manage'), deleteDictItem)

module.exports = router
