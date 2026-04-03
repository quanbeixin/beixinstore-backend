const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  listAgents,
  getAgentById,
  createAgent,
  updateAgent,
  updateAgentEnabled,
  getAgentOptions,
  executeAgent,
} = require('../controllers/agentController')

router.use(authMiddleware)

router.get('/options', getAgentOptions)
router.post('/execute', executeAgent)
router.get('/', listAgents)
router.get('/:id', getAgentById)
router.post('/', createAgent)
router.put('/:id', updateAgent)
router.patch('/:id/enabled', updateAgentEnabled)

module.exports = router
