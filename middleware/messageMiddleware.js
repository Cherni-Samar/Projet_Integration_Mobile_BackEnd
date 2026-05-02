const groqAgent = require('../services/shared/groqAgent');

const validateMessage = (req, res, next) => {
  // GET /stats, GET /history, etc. n'ont pas de body « message »
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message requis' });
  }
  if (message.length < 1) {
    return res.status(400).json({ error: 'Message trop court' });
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: 'Message trop long' });
  }
  next();
};

const quickSpamGuard = async (req, res, next) => {
  const message = req.body.message;
  if (!message) return next();

  try {
    console.log('🤖 Groq analyse le message...');
    const analysis = await groqAgent.analyze(message, {
      userId: req.body.userId
    });
   
    console.log('📊 Résultat IA:', JSON.stringify(analysis, null, 2));
   
    if (analysis.isSpam && analysis.confidence > 0.6) {
      return res.status(403).json({
        error: 'Message bloqué',
        reason: analysis.reason,
        category: analysis.category,
        confidence: analysis.confidence
      });
    }
   
    req.messageAnalysis = analysis;
    next();
  } catch (error) {
    console.error('❌ Erreur quickSpamGuard:', error.message);
    // En cas d'erreur, on laisse passer le message
    next();
  }
};

const messageLogger = (req, res, next) => {
  console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + req.url);
  next();
};

const processingTimeout = (req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Timeout - traitement trop long' });
    }
  }, 30000);
 
  res.on('finish', () => clearTimeout(timeout));
  next();
};

module.exports = {
  validateMessage,
  quickSpamGuard,
  messageLogger,
  processingTimeout
};