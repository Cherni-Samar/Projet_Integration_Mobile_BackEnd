const express = require('express');
const router  = express.Router();
const multer = require('multer');
const hera    = require('../controllers/heraController');
const dexo    = require('../controllers/dexoController'); 
const timo    = require('../controllers/timoController');
const vocalAuto = require('../services/automatedBriefing');
const authMiddleware = require('../middleware/authMiddleware');
const {
  requireAgentAccess,
  requireEmployeeAgentAccess,
} = require('../middleware/agentGuard');
const upload = multer({ dest: 'uploads/cv/' });
const { triggerStaffingForUser } = require('../services/staffingEventService');
// --- ROUTES EMPLOYÉ ---
router.post(
  '/leave-request',
  (req, res, next) => {
    console.log('📩 LEAVE REQUEST BODY:', req.body);
    next();
  },
  requireEmployeeAgentAccess('hera'),
  hera.requestLeave
);
router.post('/urgent-leave', requireEmployeeAgentAccess('hera'), hera.urgentLeave);
router.get('/leaves/:employee_id', requireEmployeeAgentAccess('hera'), hera.getLeaves);
router.get('/history/:employee_id', requireEmployeeAgentAccess('hera'), hera.getHistory);
router.post('/onboarding',                authMiddleware, requireAgentAccess('hera'), hera.onboarding);
router.post('/resignation',               authMiddleware, requireAgentAccess('hera'), hera.processResignation);
router.post('/request-doc', dexo.requestDocument);
// --- ROUTES ADMIN ---
// --- ROUTES ADMIN (PROTÉGÉES) ---
router.post('/admin/check-staffing',     authMiddleware, requireAgentAccess('hera'), hera.checkStaffingNeeds);
router.post('/admin/hire/:id',            authMiddleware, requireAgentAccess('hera'), hera.hireCandidate);

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
router.post('/chat',                     authMiddleware, requireAgentAccess('hera'), hera.chat);
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
//manager routes
router.post('/hr-request',requireEmployeeAgentAccess('hera'),hera.createHrRequest);
router.get('/hr-requests/:employee_id',requireEmployeeAgentAccess('hera'),hera.getHrRequests);
router.get('/manager/departments/:employee_id',requireEmployeeAgentAccess('hera'),hera.getManagerDepartments);
router.get('/manager/employees/:employee_id',requireEmployeeAgentAccess('hera'),hera.getManagerEmployees);
router.get('/manager/dashboard/:employee_id',requireEmployeeAgentAccess('hera'),hera.getManagerDashboard);
// Route pour déclencher le briefing vocal automatisé
router.get('/admin/trigger-vocal', async (req, res) => {
  try {
    await vocalAuto.runAutomatedVocalBriefing();
    res.json({ success: true, message: "🚀 Briefing déclenché !" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});



//testtt 
router.post('/test/staffing/:userId',     authMiddleware, requireAgentAccess('hera'), async (req, res) => {
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