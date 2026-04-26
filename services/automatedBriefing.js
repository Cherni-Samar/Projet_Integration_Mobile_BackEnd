const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const gTTS = require('gtts');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const dexoController = require('../controllers/dexoController');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID || '8680134191';

let bot = null;

if (token) {
  bot = new TelegramBot(token, { polling: false });
  console.log('✅ Telegram bot initialized with polling disabled');
} else {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN not configured. Telegram briefing disabled.');
}

const runAutomatedVocalBriefing = async () => {
  if (!bot) {
    console.warn('⚠️ Telegram bot not initialized. Skipping briefing.');
    return;
  }

  console.log('🕒 [DEXO] Déclenchement du rapport...');

  try {
    const text = await dexoController.generateBriefingLogic();

    const cleanText = String(text || 'Aucun briefing disponible')
      .replace(/[^\w\s.,!?À-ÿ:'’"-]/g, '')
      .slice(0, 900);

    const pdfPath = path.join(__dirname, 'daily_report.pdf');
    const audioPath = path.join(__dirname, 'daily_report.mp3');

    const doc = new PDFDocument({ margin: 60 });
    const pdfStream = fs.createWriteStream(pdfPath);

    doc.pipe(pdfStream);

    doc.fontSize(24).fillColor('#6366F1').text('E-TEAM EXECUTIVE REPORT', {
      align: 'center',
    });

    doc
      .moveDown()
      .fontSize(11)
      .fillColor('grey')
      .text(`Date: ${new Date().toLocaleString()}`, { align: 'center' });

    doc.moveDown(2);

    doc
      .fontSize(16)
      .fillColor('black')
      .text('Synthèse des activités du jour :', { underline: true });

    doc.moveDown();

    doc.fontSize(13).fillColor('black').text(cleanText, {
      lineGap: 8,
      align: 'left',
    });

    doc.moveDown(4);

    doc
      .fontSize(10)
      .fillColor('black')
      .text('---------------------------------------------', { align: 'center' });

    doc.fontSize(10).fillColor('black').text(
      'Document généré et certifié par Dexo IA Superviseur',
      { align: 'center' }
    );

    doc.end();

    await new Promise((resolve, reject) => {
      pdfStream.on('finish', resolve);
      pdfStream.on('error', reject);
    });

    console.log(
      '📄 PDF généré:',
      fs.existsSync(pdfPath),
      fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size : 0
    );

    console.log('🎙️ Génération audio...');

    await new Promise((resolve, reject) => {
      const gtts = new gTTS(cleanText, 'fr');
      gtts.save(audioPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(
      '🎧 Audio généré:',
      fs.existsSync(audioPath),
      fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 0
    );

    console.log('📤 Avant sendAudio');

    await bot.sendAudio(chatId, fs.createReadStream(audioPath), {
      caption: '🎙️ Briefing Vocal CEO',
      title: 'Briefing CEO DEXO',
      performer: 'DEXO',
    });

    console.log('✅ Après sendAudio');

    console.log('📤 Avant sendDocument');

    await bot.sendDocument(chatId, fs.createReadStream(pdfPath), {
      caption: "📄 PV d'Activité PDF",
    });

    console.log('✅ Après sendDocument');
    console.log('✅ Rapport audio + PDF envoyé au CEO.');
  } catch (e) {
    console.error('❌ Erreur briefing 21h:', e.message);
  }
};

cron.schedule(
  '0 21 * * *',
  () => {
    runAutomatedVocalBriefing();
  },
  {
    scheduled: true,
    timezone: 'Africa/Tunis',
  }
);

console.log('🤖 [DEXO] Système de rapport automatique configuré pour 21h00.');

module.exports = { runAutomatedVocalBriefing };