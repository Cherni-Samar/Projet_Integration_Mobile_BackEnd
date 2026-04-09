const mongoose = require('mongoose');

/**
 * Document singleton optionnel (cache / compatibilité).
 * Les totaux affichés par l’API sont calculés par agrégation sur
 * EmailReply + InboxEmail pour rester cohérents après redémarrage.
 */
const messageStatsSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  totalProcessed: { type: Number, default: 0 },
  spamBlocked: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('MessageStats', messageStatsSchema, 'message_stats');