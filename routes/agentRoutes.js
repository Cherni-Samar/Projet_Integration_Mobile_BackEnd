const express = require('express');
const router = express.Router();
const hrAgent = require('../agents/hrAgent');
const echoAgent = require('../agents/Echoagent');
const dexoAgent = require('../agents/DexoAgent');
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

// GET /api/agents/echo → Echo agent status
router.get('/echo', async (req, res) => {
  try {
    res.json({
      success: true,
      agent: 'echo',
      status: 'active',
      capabilities: ['message_analysis', 'priority_detection', 'spam_filtering', 'categorization'],
      version: '1.0.0'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/echo → Analyze message with Echo agent
router.post('/echo', authMiddleware, async (req, res) => {
  try {
    const { message, sender } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Check if user has echo agent activated
    const user = await User.findById(req.user.id).select('activeAgents');
    if (!user || !user.activeAgents.includes('echo')) {
      return res.status(403).json({
        success: false,
        message: 'Echo agent not activated for this user'
      });
    }

    const result = await echoAgent.analyze(message, sender || req.user.email);
    
    res.json({
      success: true,
      agent: 'echo',
      analysis: result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// GET /api/agents/dexo → Dexo agent status
router.get('/dexo', async (req, res) => {
  try {
    res.json({
      success: true,
      agent: 'dexo',
      status: 'active',
      capabilities: [
        'document_classification',
        'intelligent_search', 
        'security_monitoring',
        'duplicate_detection',
        'version_management',
        'expiration_tracking',
        'document_generation',
        'access_control'
      ],
      version: '1.0.0',
      integrations: ['langchain', 'n8n', 'groq'],
      mission: 'Gérer et sécuriser les documents intelligemment'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/dexo → Process document with Dexo agent
router.post('/dexo', authMiddleware, async (req, res) => {
  try {
    const { filename, content, action = 'classify', metadata = {} } = req.body;
    
    if (!filename || !content) {
      return res.status(400).json({
        success: false,
        message: 'Filename and content are required'
      });
    }

    // Check if user has dexo agent activated
    const user = await User.findById(req.user.id).select('activeAgents');
    if (!user || !user.activeAgents.includes('dexo')) {
      return res.status(403).json({
        success: false,
        message: 'Dexo agent not activated for this user'
      });
    }

    let result;
    
    switch (action) {
      case 'classify':
        result = await dexoAgent.classifyDocument(filename, content, metadata);
        break;
      case 'process':
        result = await dexoAgent.processDocument(filename, content, req.user.id, metadata);
        break;
      case 'detect_duplicates':
        result = await dexoAgent.detectDuplicates(filename, content, metadata);
        break;
      default:
        result = await dexoAgent.classifyDocument(filename, content, metadata);
    }
    
    res.json({
      success: true,
      agent: 'dexo',
      action: action,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

module.exports = router;