const express = require('express');
const router  = express.Router();
const multer = require('multer');
const hera    = require('../controllers/heraController');
const dexo    = require('../controllers/dexoController'); 
const timo    = require('../controllers/timoController');
const vocalAuto = require('../services/automatedBriefing');
const authMiddleware = require('../middleware/authMiddleware');
const upload = multer({ dest: 'uploads/cv/' });
const { triggerStaffingForUser } = require('../services/staffingEventService');
// --- ROUTES EMPLOYÉ ---
router.post('/leave-request',            hera.requestLeave);
router.post('/onboarding', authMiddleware, hera.onboarding);
router.post('/resignation', authMiddleware, hera.processResignation);
router.post('/request-doc', dexo.requestDocument);
// --- ROUTES ADMIN ---
// --- ROUTES ADMIN (PROTÉGÉES) ---
router.post('/admin/check-staffing', authMiddleware, hera.checkStaffingNeeds);
router.post('/admin/hire/:id', authMiddleware, hera.hireCandidate);

router.get('/admin/stats', authMiddleware, hera.getAdminStats);
router.get('/admin/employees', authMiddleware, hera.getAllEmployees);
router.get('/admin/recent-actions', authMiddleware, hera.getRecentActions);

router.get('/admin/dexo-checkup', authMiddleware, dexo.getDailyCheckUp);
router.get('/admin/document-actions', authMiddleware, dexo.getDocumentActions);
router.get('/admin/timo-tasks', authMiddleware, timo.getTimoTasks);
router.get('/admin/timo-inbox', authMiddleware, timo.getTimoInbox);

router.get('/admin/opportunities', authMiddleware, dexo.getOpportunities);
router.post('/admin/approve-project', authMiddleware, dexo.approveProject);

router.get('/admin/agent-interactions', authMiddleware, hera.getAgentInteractions);
router.get('/admin/agent-interactions/stats', authMiddleware, hera.getAgentInteractionStats);

// --- AGENTS ---
router.post('/chat',                     hera.chat);
router.post('/vapi-webhook',             hera.vapiWebhook);
router.get ('/admin/timo-tasks',         timo.getTimoTasks);
router.get ('/admin/timo-inbox',         timo.getTimoInbox);
router.get('/admin/opportunities', dexo.getOpportunities);
router.post('/admin/approve-project', dexo.approveProject);
router.post(
  '/candidate/apply',
  (req, res, next) => {
    console.log('🔥 ROUTE HIT AVANT MULTER');
    next();
  },
  upload.single('resume_file'),
  (req, res, next) => {
    console.log('✅ MULTER OK');
    console.log('BODY:', req.body);
    console.log('FILE:', req.file);
    next();
  },
  hera.processCandidacy
);// Dans routes/heraRoutes.js
router.get('/admin/agent-interactions', hera.getAgentInteractions);
router.get('/admin/agent-interactions/stats', hera.getAgentInteractionStats);

router.get('/admin/trigger-vocal', async (req, res) => {
  try {
    await vocalAuto.runAutomatedVocalBriefing();
    res.json({ success: true, message: "🚀 Briefing déclenché !" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


//testtt 
router.post('/test/staffing/:userId', authMiddleware, async (req, res) => {
  try {
    await triggerStaffingForUser(req.params.userId);

    res.json({
      success: true,
      message: 'Hera staffing analysis triggered',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
module.exports = router;