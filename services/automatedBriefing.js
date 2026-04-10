const cron = require('node-cron');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const gTTS = require('gtts');
const path = require('path');
const fs = require('fs'); // ✅ Ajout pour vérifier le fichier
const dexoController = require('../controllers/dexoController');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('🚀 Dexo WhatsApp est prêt !'));

const runAutomatedVocalBriefing = async () => {
    console.log("🕒 Dexo prépare le rapport vocal...");

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
        console.log("💾 Fichier MP3 créé avec succès");

        // ✅ STRATÉGIE D'ENVOI
        let targetId;

        // Option A : Envoyer à SOI-MÊME (Le plus fiable pour la démo)
        // Cela utilise l'identifiant du compte qui a scanné le QR Code
        targetId = client.info.wid._serialized; 
        
        /* 
        // Option B : Si tu veux envoyer à un AUTRE numéro (décommente si besoin)
        const rawNumber = "216XXXXXXXX"; 
        const contactId = await client.getNumberId(rawNumber);
        if (contactId) {
            targetId = contactId._serialized;
        }
        */

        if (targetId) {
            const media = MessageMedia.fromFilePath(filePath);
            await client.sendMessage(targetId, media, { sendAudioAsVoice: true });
            console.log("✅ Message vocal envoyé avec succès à :", targetId);
        } else {
            console.error("❌ Erreur : Aucun destinataire trouvé.");
        }

    } catch (e) {
        console.error("❌ Erreur durant l'envoi WhatsApp:", e.message);
    }
};

client.initialize();

module.exports = { runAutomatedVocalBriefing };