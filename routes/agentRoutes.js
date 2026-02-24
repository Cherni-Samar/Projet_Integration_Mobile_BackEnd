const express = require('express');
const router = express.Router();
const hrAgent = require('../agents/hrAgent');

// GET /api/agents/hr → Hello World
router.get('/hr', async (req, res) => {
  try {
    const result = await hrAgent.process('hello', {}, {
      username: req.query.username,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/hr → intent générique
router.post('/hr', async (req, res) => {
  try {
    const { intent, payload, context } = req.body;
    const result = await hrAgent.process(intent, payload, context);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;