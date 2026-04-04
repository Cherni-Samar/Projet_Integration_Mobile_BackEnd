/**
 * Initialise le document cache message_stats (optionnel).
 * Les totaux affichés par GET /api/messages/stats viennent des agrégations
 * sur les collections emails (InboxEmail) et email_replies (EmailReply).
 *
 * Usage: node scripts/init-message-stats.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MessageStats = require('../models/MessageStats');

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI manquant');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  await MessageStats.findByIdAndUpdate(
    'global',
    {
      _id: 'global',
      totalProcessed: 0,
      spamBlocked: 0,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log('OK: document message_stats _id=global initialisé (0, 0).');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});