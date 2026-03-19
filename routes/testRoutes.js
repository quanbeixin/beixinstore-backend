const express = require('express');
const router = express.Router();

// GET /api/ping - 健康检查
router.get('/ping', (req, res) => {
  res.json({ message: 'pong' });
});

module.exports = router;
