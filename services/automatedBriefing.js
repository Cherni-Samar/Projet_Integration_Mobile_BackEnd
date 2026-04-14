const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const gTTS = require('gtts');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit'); // Moteur PDF
const dexoController = require('../controllers/dexoController');

// Configuration
const token = '8667434515:AAH2LwZ9z2Me8NcOBIAfOQLXNa30HkkHHYQ'; 
const bot = new TelegramBot(token, { polling: true });
const chatId = '8680134191'; 

const runAutomatedVocalBriefing = async () => {
    console.log("🕒 [DEXO] Exécution du rapport quotidien (Vocal + PDF)...");

    try {
        // A. Récupération du texte IA
        const text = await dexoController.generateBriefingLogic();
        const cleanText = text.replaceAll('*', ''); 
        
        // B. Génération du PDF (PV d'Activité)
        const pdfPath = path.join(__dirname, 'daily_report.pdf');
        const doc = new PDFDocument();
        const pdfStream = fs.createWriteStream(pdfPath);
        doc.pipe(pdfStream);
        doc.fontSize(20).fillColor('#6366F1').text('E-TEAM EXECUTIVE REPORT', { align: 'center' });
        doc.moveDown().fontSize(10).fillColor('grey').text(`Généré le ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(2).fontSize(12).fillColor('black').text(cleanText, { lineGap: 5 });
        doc.end();

        // C. Génération du Vocal (MP3)
        const audioPath = path.join(__dirname, 'daily_report.mp3');
        const gtts = new gTTS(cleanText, 'fr');
        const saveAudio = () => {
            return new Promise((resolve, reject) => {
                gtts.save(audioPath, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        };
        await saveAudio();

        // Attendre la fin de l'écriture du PDF
        await new Promise(resolve => pdfStream.on('finish', resolve));

        // D. Envoi sur Telegram
        if (fs.existsSync(audioPath) && fs.existsSync(pdfPath)) {
            // 1. Envoi Vocal
            await bot.sendVoice(chatId, fs.createReadStream(audioPath), {
                caption: "🎙️ *Briefing Vocal CEO*",
                parse_mode: 'Markdown'
            });
            // 2. Envoi PDF
            await bot.sendDocument(chatId, fs.createReadStream(pdfPath), {
                caption: "📄 *PV d'Activité PDF*",
                parse_mode: 'Markdown'
            });
            console.log("✅ Rapport envoyé au CEO à 21h00.");
        }

    } catch (e) {
        console.error("❌ Erreur briefing 21h:", e.message);
    }
};

// ── ✅ PLANIFICATION : TOUS LES JOURS À 21H00 (HEURE TUNISIE) ──
cron.schedule('0 21 * * *', () => {
    runAutomatedVocalBriefing();
}, {
    scheduled: true,
    timezone: "Africa/Tunis"
});

console.log("🤖 [DEXO] Système de rapport automatique configuré pour 21h00.");

module.exports = { runAutomatedVocalBriefing };