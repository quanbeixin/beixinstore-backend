const express = require('express')
const {
  getPublicFeedbackFormMeta,
  submitPublicFeedback,
} = require('../controllers/publicFeedbackController')

const router = express.Router()

router.use((req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    res.set('Surrogate-Control', 'no-store')
  }
  next()
})

router.get('/form-meta', getPublicFeedbackFormMeta)
router.post('/submit', submitPublicFeedback)

module.exports = router
