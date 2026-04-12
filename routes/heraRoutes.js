const express = require('express');
const router  = express.Router();
const multer = require('multer');
const hera    = require('../controllers/heraController');
const dexo = require('../controllers/dexoController'); // ✅ AJOUTE CETTE LIGNE
const upload = multer({ dest: 'uploads/resumes/' }); // Les fichiers iront dans ce dossier
const timo = require('../controllers/timoController');
const vocalAuto = require('../services/automatedBriefing');
const dexoController = require('../controllers/dexoController');

router.post('/hello',                    hera.hello);
router.post('/leave-request',            hera.requestLeave);
router.post('/leave-urgent',             hera.urgentLeave);
router.post('/onboarding',               hera.onboarding);
router.post('/promote',                  hera.promote);
router.post('/offboarding',              hera.offboarding);
router.get ('/history/:employee_id',     hera.getHistory);
router.post('/send-email', hera.sendEmailToEcho);
router.get ('/leaves/:employee_id',      hera.getLeaves);
router.get('/leave-history/:employee_id', hera.getLeaveHistory);

// Route test cron (à supprimer en production)
router.get('/admin/test-cron', async (req, res) => {
  const { checkExpiringContracts } = require('../services/contractCron');
  await checkExpiringContracts();
  res.json({ success: true, message: '✅ Cron exécuté manuellement' });
});

// ══════════════════════════════════════════════════════════════════════════
// 🔥 ROUTE VAPI
// 🔥 ROUTE VAPI
router.post('/request-leave', hera.requestLeave);

// ══════════════════════════════════════════════════════════════════════════
router.get('/admin/all-actions',           hera.getAllActions);
router.delete('/admin/action/:action_id',  hera.deleteAction);

// ══════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN
// ══════════════════════════════════════════════════════════════════════════

// Recrutement & Staffing
router.post('/admin/check-staffing', hera.checkStaffingNeeds); // Hera analyse les besoins et mail Echo

// Assure-toi que cette ligne est présente
router.post('/candidate/apply', upload.single('resume_file'), hera.processCandidacy);

// Documents
router.post('/generate-doc', hera.generateDocument); // Génère Contrat ou Attestation

router.get ('/admin/stats',              hera.getAdminStats);
router.get ('/admin/employees',          hera.getAllEmployees);
router.get ('/admin/recent-actions',     hera.getRecentActions);

router.post('/chat', hera.chat);
router.post('/vapi-webhook', hera.vapiWebhook);
router.post('/admin/init-docs', hera.initAllMissingDocs);

router.get('/admin/dexo-checkup', dexo.getDailyCheckUp);
router.get('/admin/document-actions', dexo.getDocumentActions); // ✅✅✅ AJOUTE CETTE LIGNE ICI ✅✅✅

// Étape 1 : Le candidat postule (Formulaire HTML)
router.post('/resignation', hera.processResignation);
router.post('/request-doc', dexoController.requestDocument);

// Étape 2 : L'admin valide (Application Flutter)
router.post('/admin/hire/:id', hera.hireCandidate);
router.get('/candidates', hera.getAllCandidates);

router.post('/admin/timo-confirm', timo.confirmPlanning); // ✅ POUR ENREGISTRER LA DATE
router.get('/admin/timo-tasks', timo.getTimoTasks);
router.get('/admin/timo-inbox', timo.getTimoInbox); // ✅ Doit être identique au nom dans l'URL

router.get('/admin/trigger-vocal', async (req, res) => {
  try {
    await vocalAuto.runAutomatedVocalBriefing();
    res.json({ success: true, message: "🚀 Envoi du vocal WhatsApp déclenché !" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
