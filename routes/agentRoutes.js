const express = require('express');
const router = express.Router();
const hrAgent = require('../agents/hrAgent');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

// POST /api/agents/hire → Add an agent to the user's activeAgents (within plan limit)
router.post('/hire', authMiddleware, async (req, res, next) => {
  try {
    const { agentId } = req.body;
    if (!agentId) {
      return res.status(400).json({
        success: false,
        message: 'agentId requis',
      });
    }

    const user = await User.findById(req.user.id).select('activeAgents maxAgentsAllowed');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
      });
    }

    const activeAgents = Array.isArray(user.activeAgents) ? user.activeAgents : [];
    const maxAgentsAllowed = typeof user.maxAgentsAllowed === 'number' ? user.maxAgentsAllowed : 1;

    // Idempotent: hiring an already-active agent is a no-op
    if (!activeAgents.includes(agentId)) {
      if (activeAgents.length >= maxAgentsAllowed) {
        const err = new Error('Limite d\'agents atteinte pour votre plan.');
        err.statusCode = 403;
        throw err;
      }
      user.activeAgents = [...activeAgents, agentId];
      await user.save();
    }

    return res.status(200).json({
      success: true,
      activeAgents: user.activeAgents,
      maxAgentsAllowed: user.maxAgentsAllowed,
    });
  } catch (err) {
    return next(err);
  }
});

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