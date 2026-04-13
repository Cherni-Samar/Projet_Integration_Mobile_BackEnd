const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const gTTS = require('gtts');
const path = require('path');
const fs = require('fs');
const dexoController = require('../controllers/dexoController');

// 1. Configuration (Remplace par ton NOUVEAU token si tu l'as changé)
const token = process.env.TELEGRAM_BOT_TOKEN || '8667434515:AAE6lfzLQc-30QGU4RKT-nKR0EVdARjoP-E'; 
const bot = new TelegramBot(token, { polling: true });
const chatId = process.env.TELEGRAM_CHAT_ID || '8680134191'; 

const runAutomatedVocalBriefing = async () => {
    console.log("🕒 [DEXO] Déclenchement du rapport...");

    try {
        const text = await dexoController.generateBriefingLogic();
        const cleanText = text.replaceAll('*', ''); 
        
        const filePath = path.join(__dirname, 'daily_report.mp3');
        const gtts = new gTTS(cleanText, 'fr');

        const saveAudio = () => {
            return new Promise((resolve, reject) => {
                gtts.save(filePath, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        };

        await saveAudio();

        if (fs.existsSync(filePath)) {
            await bot.sendVoice(chatId, fs.createReadStream(filePath), {
                caption: "🌙 *Daily Check-up CEO* - Rapport quotidien",
                parse_mode: 'Markdown'
            });
            console.log("✅ Rapport vocal envoyé avec succès !");
        }

    } catch (e) {
        console.error("❌ Erreur lors du briefing:", e.message);
    }
};

// ── ✅ PLANIFICATION FINALE : TOUS LES JOURS À 21H00 (TUNISIE) ──
cron.schedule('0 21 * * *', () => {
    console.log("🕒 [DEXO] Il est 21h00. Génération du rapport quotidien...");
    runAutomatedVocalBriefing();
}, {
    scheduled: true,
    timezone: "Africa/Tunis"
});

console.log("✅ Le briefing automatique est programmé pour 21h00 tous les soirs.");

module.exports = { runAutomatedVocalBriefing };
