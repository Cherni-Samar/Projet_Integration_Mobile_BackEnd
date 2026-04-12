const express = require('express');
const router = express.Router();
const echoController = require('../controllers/echoController');

// Routes existantes
router.post('/analyser', echoController.analyser);
router.post('/full-analysis', echoController.fullAnalysis);
router.post('/auto-reply', echoController.autoReply);
router.post('/response-suggestions', echoController.responseSuggestions);
router.post('/check-escalation', echoController.checkEscalation);
router.post('/filter-noise', echoController.filterNoise);
router.post('/extract-tasks', echoController.extractTasks);
router.post('/batch', echoController.batch);
router.post('/batch-advanced', echoController.batchAdvanced);
router.post('/send-to-hera', echoController.sendToHera);
router.post('/classify-document', echoController.classifyDocument);
router.post('/save-document', echoController.saveDocument);
router.get('/documents/:category', echoController.getDocumentsByCategory);
router.get('/document-content/:documentId', echoController.getDocumentContent);
router.post('/extract-save-tasks', echoController.extractAndSaveTasks);
router.get('/tasks', echoController.getTasks);
router.patch('/tasks/:taskId/status', echoController.updateTaskStatus);
router.delete('/tasks/:taskId', echoController.deleteTask);
router.get('/stats', echoController.getStats);
router.get('/emails', echoController.getEmails);
router.get('/pending', echoController.getPending);
router.patch('/emails/:id/read', echoController.markEmailRead);
router.delete('/emails/:id', echoController.deleteEmail);
router.post('/reset-memoire', echoController.resetMemoire);
router.get('/sante', echoController.sante);
router.post('/receive-staffing-alert', echoController.receiveHeraStaffingAlert);

// ============================================================
// ROUTES LINKEDIN
// ============================================================

// Obtenir l'URL d'authentification LinkedIn
router.get('/linkedin/auth-url', async (req, res) => {
    try {
        const linkedinService = require('../services/linkedin.service');
        const authUrl = linkedinService.getAuthUrl();
        res.json({
            success: true,
            authUrl: authUrl,
            message: 'Ouvrez cette URL dans votre navigateur pour autoriser Echo à publier sur LinkedIn'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Callback après authentification LinkedIn
router.get('/linkedin/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return res.status(400).json({ success: false, error: `LinkedIn error: ${error}` });
    }

    if (!code) {
        return res.status(400).json({ success: false, error: 'Code manquant' });
    }

    try {
        const linkedinService = require('../services/linkedin.service');
        const result = await linkedinService.getAccessToken(code);

        if (result.success) {
            res.json({
                success: true,
                message: 'Authentification LinkedIn réussie ! Echo peut maintenant publier automatiquement.',
                redirect: '/api/echo/sante'
            });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Publier manuellement sur LinkedIn
router.post('/linkedin/post', async (req, res) => {
    const { content } = req.body;

    if (!content) {
        return res.status(400).json({ success: false, error: 'Le champ content est requis' });
    }

    try {
        const linkedinService = require('../services/linkedin.service');
        const result = await linkedinService.post(content);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Publier un post de recrutement
router.post('/linkedin/recruitment', async (req, res) => {
    const { jobTitle, jobDescription, location, contractType } = req.body;

    try {
        const recruitmentPost = `
🚨 **RECRUTEMENT** 🚨

Nous recherchons un(e) ${jobTitle || 'nouveau talent'} pour rejoindre notre équipe !

📌 **Poste** : ${jobTitle || 'À définir'}
📍 **Lieu** : ${location || 'Télétravail / France'}
📄 **Type** : ${contractType || 'CDI / CDD'}
📝 **Description** : ${jobDescription || 'Description du poste à venir'}

✨ Ce que nous offrons :
- Environnement innovant
- Équipe dynamique
- Projets stimulants

📩 **Postulez ici** : ${process.env.RECRUITMENT_FORM_URL || 'http://localhost:3000/candidature'}

#Recrutement #Emploi #Carrière #Job
    `;

        const linkedinService = require('../services/linkedin.service');
        const result = await linkedinService.post(recruitmentPost);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtenir le statut du token LinkedIn
router.get('/linkedin/status', async (req, res) => {
    try {
        const linkedinService = require('../services/linkedin.service');
        const hasToken = !!linkedinService.accessToken;
        res.json({
            success: true,
            hasToken: hasToken,
            message: hasToken ? 'Token LinkedIn présent' : 'Token LinkedIn manquant. Authentifiez-vous via /api/echo/linkedin/auth-url'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Forcer une publication automatique immédiate (AVEC IMAGE)
router.post('/social/force-post', async (req, res) => {
    try {
        const { tick } = require('../services/echoLinkedInAutonomy');
        // On passe 'true' pour forcer la publication même si les 3 jours ne sont pas passés
        await tick(true); 
        res.json({ success: true, message: '🚀 Publication forcée sur LinkedIn et Mastodon avec image !' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;