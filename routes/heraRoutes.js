const express = require('express');
const router  = express.Router();
const hera    = require('../controllers/heraController');

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
router.post('/candidate/apply', hera.processCandidacy);
// Documents
router.post('/generate-doc', hera.generateDocument); // Génère Contrat ou Attestation
router.get ('/admin/stats',              hera.getAdminStats);
router.get ('/admin/employees',          hera.getAllEmployees);
router.get ('/admin/recent-actions',     hera.getRecentActions);
router.post('/chat', hera.chat);
router.post('/vapi-webhook', hera.vapiWebhook);
router.post('/admin/init-docs', hera.initAllMissingDocs);
module.exports = router;