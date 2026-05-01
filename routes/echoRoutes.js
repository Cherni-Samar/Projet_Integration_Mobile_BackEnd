const express = require('express');
const router = express.Router();
const echoController = require('../controllers/echoController');
const imageProxyController = require('../controllers/imageProxyController');
const authMiddleware = require('../middleware/authMiddleware');
const { agentGuardMiddleware } = require('../utils/agentGuard');

// Image proxy route
router.get('/image-proxy', imageProxyController.proxyImage);

// Routes existantes (basic analysis - no guard needed for basic functionality)
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
router.post('/save-document', echoController.saveDocument);
router.post('/extract-save-tasks', echoController.extractAndSaveTasks);
router.get('/tasks', echoController.getTasks);
router.patch('/tasks/:taskId/status', echoController.updateTaskStatus);
router.delete('/tasks/:taskId', echoController.deleteTask);
router.get('/stats', echoController.getStats);
router.get('/pending', echoController.getPending);
router.get('/emails', authMiddleware, echoController.getEmails);
router.patch('/emails/:id/read', authMiddleware, echoController.markEmailRead);
router.delete('/emails/:id', authMiddleware, echoController.deleteEmail);
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

// Publier manuellement sur LinkedIn (PROTECTED - requires Echo agent)
router.post('/linkedin/post', authMiddleware, agentGuardMiddleware('echo'), async (req, res) => {
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

// Publier un post de recrutement (PROTECTED - requires Echo agent)
router.post('/linkedin/recruitment', authMiddleware, agentGuardMiddleware('echo'), async (req, res) => {
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

// Forcer une publication automatique immédiate (PROTECTED - requires Echo agent)
router.post('/social/force-post', authMiddleware, agentGuardMiddleware('echo'), async (req, res) => {
    try {
        const { tick } = require('../services/echoLinkedInAutonomy');
        // On passe 'true' pour forcer la publication même si les 3 jours ne sont pas passés
        await tick(true); 
        res.json({ success: true, message: '🚀 Publication forcée sur LinkedIn et Mastodon avec image !' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// ROUTES CONFIGURATION PRODUCT LINK
// ============================================================

// Get current product link configuration
router.get('/config/product-link', echoController.getProductLinkConfig);

// Update product link configuration
router.put('/config/product-link', echoController.updateProductLinkConfig);

// Delete product link configuration
router.delete('/config/product-link', echoController.deleteProductLinkConfig);

// ============================================================
// MOBILE API ROUTES
// ============================================================

// Mobile configuration endpoints
router.get('/mobile/config', echoController.getMobileConfig);
router.put('/mobile/product-link', echoController.updateMobileProductLink);

// Mobile posts and logs
router.get('/mobile/posts', echoController.getMobilePosts);
router.post('/mobile/force-post', authMiddleware, agentGuardMiddleware('echo'), echoController.mobileForcePost);

// Mobile dashboard
router.get('/mobile/dashboard', echoController.getMobileDashboard);

// Mobile posts metrics (for command center UI)
router.get('/mobile/posts-metrics', echoController.getPostsMetrics);

// ============================================================
// PRODUCT MARKETING AUTOMATION ROUTES (PROTECTED - requires Echo agent)
// ============================================================

// Scrape product information (PROTECTED)
router.post('/product/scrape', authMiddleware, agentGuardMiddleware('echo'), echoController.scrapeProduct);

// Generate marketing post (PROTECTED)
router.post('/product/generate-post', authMiddleware, agentGuardMiddleware('echo'), echoController.generateProductPost);

// Campaign management (PROTECTED)
router.post('/product/campaign/start', authMiddleware, agentGuardMiddleware('echo'), echoController.startProductCampaign);
router.get('/product/campaign/status', echoController.getCampaignStatus);
router.get('/product/campaign/history', echoController.getCampaignHistory);
router.post('/product/campaign/stop', authMiddleware, agentGuardMiddleware('echo'), echoController.stopProductCampaign);
router.post('/product/campaign/toggle', authMiddleware, agentGuardMiddleware('echo'), echoController.toggleProductCampaign);

// Manual campaign trigger (PROTECTED - for testing)
router.post('/product/campaign/trigger-now', authMiddleware, agentGuardMiddleware('echo'), async (req, res) => {
  try {
    const ProductCampaignScheduler = require('../services/productCampaignScheduler.service');
    await ProductCampaignScheduler.triggerNow();
    res.json({ 
      success: true, 
      message: '🚀 Campaign check triggered manually. Check console for results.' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;