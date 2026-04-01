const InboxEmail = require('../models/InboxEmail');
const EmailReply = require('../models/EmailReply');
const MessageStats = require('../models/MessageStats');

/**
 * Totaux fiables après redémarrage : source = collections, pas la mémoire.
 */
async function getAggregatedStats() {
  const [totalProcessed, spamBlocked] = await Promise.all([
    EmailReply.countDocuments(),
    InboxEmail.countDocuments({ isSpam: true }),
  ]);
  return {
    totalProcessed,
    spamBlocked,
    uptime: Math.floor(process.uptime()),
  };
}

async function syncMessageStatsCache() {
  const stats = await getAggregatedStats();
  await MessageStats.findByIdAndUpdate(
    'global',
    {
      totalProcessed: stats.totalProcessed,
      spamBlocked: stats.spamBlocked,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return stats;
}

/**
 * Enregistre une réponse envoyée (manuelle ou auto). Une ligne = +1 totalProcessed côté agrégation.
 */
async function recordReply({
  emailId,
  replyContent,
  sentBy = 'echo@e-team.com',
  channel = 'smtp',
  status = 'sent',
  userId = null,
}) {
  const doc = await EmailReply.create({
    emailId,
    replyContent,
    sentBy,
    channel,
    status,
    userId,
  });
  await syncMessageStatsCache();
  return doc;
}

module.exports = {
  getAggregatedStats,
  syncMessageStatsCache,
  recordReply,
};
