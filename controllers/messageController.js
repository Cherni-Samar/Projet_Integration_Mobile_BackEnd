const mongoose = require('mongoose');
const echoAgent = require('../services/echoAgent');
const groqAgent = require('../services/groqAgent');
const inboxStatsService = require('../services/inboxStatsService');
const InboxEmail = require('../models/InboxEmail');

// 🔹 ECHO
exports.echo = async (req, res) => {
  const { message, sender } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message requis' });
  }

  try {
    console.log('🤖 Agent Echo analyse le message...');
    const analysis = await echoAgent.analyze(message, sender);

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
      original: message,
    });
  } catch (error) {
    console.error('Erreur Echo:', error);
    res.status(500).json({ error: error.message });
  }
};

// 🔹 PROCESS
exports.processMessage = async (req, res) => {
  const { message, userId } = req.body;

  res.json({
    success: true,
    message: 'Message processed',
    data: {
      original: message,
      response: 'Message received: ' + (message || ''),
      userId: userId || 'anonymous',
      timestamp: new Date().toISOString(),
    },
  });
};

// 🔹 SPAM CHECK
exports.spamCheck = async (req, res) => {
  const { message, persist = true } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'message requis' });
  }

  try {
    const result = await groqAgent.analyze(message, {});

    let spamRecord = null;
    const isSpam = result.isSpam === true;
    let confidence = typeof result.confidence === 'number' ? result.confidence : 0;
    if (isSpam && confidence === 0) confidence = 0.85;

    if (isSpam && persist && confidence >= 0.5) {
      const maxLen = parseInt(process.env.MAX_MESSAGE_LENGTH, 10) || 5000;

      const ownerId =
        req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id)
          ? new mongoose.Types.ObjectId(req.user.id)
          : null;

      spamRecord = await InboxEmail.create({
        subject: '(Contrôle spam)',
        sender: 'spam-check@system',
        content: message.slice(0, maxLen),
        summary: result.reason || 'Message classé comme spam',
        isUrgent: false,
        isSpam: true,
        priority: 'low',
        actions: [],
        category: result.category || 'spam',
        receivedAt: new Date(),
        isRead: true,
        ownerId,
        source: 'spam_check',
      });

      await inboxStatsService.syncMessageStatsCache();
    }

    const stats = await inboxStatsService.getAggregatedStats();

    res.json({
      success: result.success !== false,
      ...result,
      persisted: !!spamRecord,
      spamEmailId: spamRecord ? spamRecord._id.toString() : undefined,
      stats,
    });
  } catch (error) {
    console.error('spam-check:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🔹 STATS
exports.getStats = async (req, res) => {
  try {
    const { totalProcessed, spamBlocked, uptime } =
      await inboxStatsService.getAggregatedStats();

    res.json({
      success: true,
      stats: {
        totalProcessed,
        spamBlocked,
        uptime,
        total_processed: totalProcessed,
        spam_blocked: spamBlocked,
      },
      totalProcessed,
      spamBlocked,
      total_processed: totalProcessed,
      spam_blocked: spamBlocked,
      uptime,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 🔹 HISTORY
exports.getHistory = (req, res) => {
  res.json({
    success: true,
    history: [],
    message: 'Historique - à implémenter',
  });
};