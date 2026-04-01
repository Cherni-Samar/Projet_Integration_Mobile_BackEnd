const express = require('express');
const router  = express.Router();
const hera    = require('../controllers/heraController');

router.post('/hello',                    hera.hello);
router.post('/leave-request',            hera.requestLeave);
router.post('/leave-urgent',             hera.urgentLeave);
router.post('/onboarding',               hera.onboarding);
router.post('/promote',                  hera.promote);
router.post('/offboarding',              hera.offboarding);
router.post('/send-email', hera.sendEmailToEcho);
// Route pour recevoir les emails d'Echo
router.post('/receive-email', hera.receiveEmailFromEcho);
router.get ('/history/:employee_id',     hera.getHistory);
router.get ('/leaves/:employee_id',      hera.getLeaves);


// ══════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN
// ══════════════════════════════════════════════════════════════════════════

router.get ('/admin/stats',              hera.getAdminStats);
router.get ('/admin/employees',          hera.getAllEmployees);
router.get ('/admin/recent-actions',     hera.getRecentActions);

module.exports = router;