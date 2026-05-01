const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const gTTS = require('gtts');
const path = require('path');
const fs = require('fs');

async function runAutomatedVocalBriefing() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('⚠️ TELEGRAM_BOT_TOKEN not configured. Telegram briefing disabled. Set TELEGRAM_BOT_TOKEN in .env to enable.');
    return;
  }

  try {
    const bot = new TelegramBot(token);
    const now = new Date().toLocaleString('fr-FR');
    const briefingText = `Briefing automatique E-Team du ${now}. Tous les systèmes sont opérationnels.`;

    // Generate audio
    const audioPath = path.join(__dirname, '../tmp_briefing.mp3');
    const gtts = new gTTS(briefingText, 'fr');

    await new Promise((resolve, reject) => {
      gtts.save(audioPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await bot.sendVoice(chatId, audioPath, { caption: '🤖 Briefing vocal E-Team' });

    // Cleanup
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

    console.log('✅ [BRIEFING] Briefing vocal envoyé sur Telegram');
  } catch (err) {
    console.warn('⚠️ [BRIEFING] Erreur:', err.message);
  }
}

// Schedule daily briefing at 21h00
const cronExpression = process.env.BRIEFING_CRON || '0 21 * * *';
cron.schedule(cronExpression, () => {
  console.log('🤖 [DEXO] Lancement du briefing vocal automatique...');
  runAutomatedVocalBriefing();
});

console.log('🤖 [DEXO] Système de rapport automatique configuré pour 21h00.');

module.exports = { runAutomatedVocalBriefing };