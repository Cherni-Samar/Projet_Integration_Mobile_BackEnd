const express = require('express');
<<<<<<< HEAD
const router  = express.Router();
const multer = require('multer');
const hera    = require('../controllers/heraController');
const dexo    = require('../controllers/dexoController'); 
const timo    = require('../controllers/timoController');
const vocalAuto = require('../services/automatedBriefing');
=======
const router = express.Router();
const multer = require('multer');
const path = require('path');
const hera = require('../controllers/heraController');
const dexo = require('../controllers/dexoController');

// ── Configuration Multer pour les CV (PDF) ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const uniqueName = `cv_${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Seuls les fichiers PDF sont acceptés'), false);
  }
});
>>>>>>> 640174d (fix: formulaire candidature + emails + ngrok cleanup)

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
<<<<<<< HEAD
=======
// ══════════════════════════════════════════════════════════════════════════
// 🔥 ROUTE VAPI
// 🔥 ROUTE VAPI
router.post('/request-leave', hera.requestLeave);

// ══════════════════════════════════════════════════════════════════════════
router.get('/admin/all-actions', hera.getAllActions);
router.delete('/admin/action/:action_id', hera.deleteAction);
// ══════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN
// ══════════════════════════════════════════════════════════════════════════
// Recrutement & Staffing
router.post('/admin/check-staffing', hera.checkStaffingNeeds); // Hera analyse les besoins et mail Echo
// Assure-toi que cette ligne est présente
router.post('/candidate/apply', upload.single('resume_file'), hera.processCandidacy);
// Documents
router.post('/generate-doc', hera.generateDocument); // Génère Contrat ou Attestation
router.get('/admin/stats', hera.getAdminStats);
router.get('/admin/employees', hera.getAllEmployees);
router.get('/admin/recent-actions', hera.getRecentActions);
router.post('/chat', hera.chat);
router.post('/vapi-webhook', hera.vapiWebhook);
router.post('/admin/init-docs', hera.initAllMissingDocs);
router.get('/admin/dexo-checkup', dexo.getDailyCheckUp); // ✅ MODIFIE L'APPEL ICI
>>>>>>> 640174d (fix: formulaire candidature + emails + ngrok cleanup)

module.exports = router;