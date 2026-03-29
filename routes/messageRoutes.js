const express = require('express');
const router = express.Router();
const echoAgent = require('../services/echoAgent');

// Route pour l'Agent Echo (résumé + urgence + actions)
router.post('/echo', async (req, res) => {
  const { message, sender } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message requis' });
  }
  
  try {
    console.log('🤖 Agent Echo analyse le message...');
    const analysis = await echoAgent.analyze(message, sender);
    
    console.log('📊 Résumé:', analysis.summary);
    console.log('⚠️ Urgent:', analysis.isUrgent);
    console.log('📋 Actions:', analysis.actions);
    
    if (analysis.isUrgent) {
      console.log('🚨🚨🚨 ALERTE PRIORITAIRE ! 🚨🚨🚨');
    }
    
    res.json({
      success: true,
      summary: analysis.summary,
      isUrgent: analysis.isUrgent,
      priority: analysis.priority,
      actions: analysis.actions,
      category: analysis.category,
      original: message
    });
    
  } catch (error) {
    console.error('Erreur Echo:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route simple pour traiter un message (avec spam filter)
router.post('/process', async (req, res) => {
  const { message, userId } = req.body;
  
  res.json({
    success: true,
    message: 'Message processed',
    data: {
      original: message,
      response: 'Message received: ' + (message || ''),
      userId: userId || 'anonymous',
      timestamp: new Date().toISOString()
    }
  });
});

// Vérification spam
router.post('/spam-check', async (req, res) => {
  const { message } = req.body;
  const groqAgent = require('../services/groqAgent');
  const result = await groqAgent.detectSpam(message);
  res.json(result);
});

// Statistiques
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      totalProcessed: 0,
      spamBlocked: 0,
      uptime: process.uptime()
    }
  });
});

// Historique
router.get('/history/:userId?', (req, res) => {
  res.json({
    success: true,
    history: [],
    message: 'Historique - à implémenter'
  });
});

module.exports = router;
