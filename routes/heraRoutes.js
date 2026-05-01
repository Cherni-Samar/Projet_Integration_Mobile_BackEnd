const express = require('express');
const router = express.Router();
const multer = require('multer');
const hera = require('../controllers/heraController');
const dexo = require('../controllers/dexoController');
const timo = require('../controllers/timoController');
const vocalAuto = require('../services/automatedBriefing');
const upload = multer({ dest: 'uploads/resumes/' });

// --- ROUTES EMPLOYÉ ---
router.post('/leave-request',            hera.requestLeave);
router.post('/onboarding',               hera.onboarding);
router.post('/resignation',              hera.processResignation);
router.post('/request-doc',              dexo.requestDocument);
router.post('/candidate/apply',          upload.single('resume_file'), hera.processCandidacy);

// --- ROUTES ADMIN ---
router.post('/admin/check-staffing',     hera.checkStaffingNeeds);
router.post('/admin/hire/:id',           hera.hireCandidate);
router.get ('/admin/stats',              hera.getAdminStats);
router.get ('/admin/employees',          hera.getAllEmployees);
router.get ('/admin/recent-actions',     hera.getRecentActions);
router.get ('/admin/dexo-checkup',       dexo.getDailyCheckUp);
router.get ('/admin/document-actions',   dexo.getDocumentActions);

// --- AGENTS ---
router.post('/chat',                     hera.chat);
router.post('/vapi-webhook',             hera.vapiWebhook);
router.get ('/admin/timo-tasks',         timo.getTimoTasks);
router.get ('/admin/timo-inbox',         timo.getTimoInbox);
// Dans routes/heraRoutes.js
router.get('/admin/agent-interactions', hera.getAgentInteractions);
router.get('/admin/agent-interactions/stats', hera.getAgentInteractionStats);
router.get('/admin/trigger-vocal', async (req, res) => {
  try {
    await vocalAuto.runAutomatedVocalBriefing();
    res.json({ success: true, message: "🚀 Briefing déclenché !" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;