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
router.post('/request-leave', async (req, res, next) => {
  console.log('🔥 ROUTE VAPI /request-leave APPELÉE');
  console.log('📦 BODY REÇU =>', req.body);

  try {
    const { employee_name, type, start_date, end_date, reason } = req.body;

    console.log('📞 VAPI CALL =>', req.body);

    const Employee = require('../models/Employee');

    if (!employee_name || !type || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message:
          '❌ Champs requis : employee_name, type, start_date, end_date',
      });
    }

    // Recherche par nom exact, puis fallback insensible à la casse
    let employee = await Employee.findOne({ name: employee_name });

    if (!employee) {
      employee = await Employee.findOne({
        name: { $regex: `^${employee_name}$`, $options: 'i' },
      });
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'employee_not_found',
        message: `❌ Employé introuvable : ${employee_name}`,
      });
    }

    // On transforme le body pour correspondre exactement à hera.requestLeave
    req.body = {
      employee_id: employee._id.toString(),
      employee_email: employee.email,
      type,
      start_date,
      end_date,
      reason: reason || 'Congé demandé via Hera Voice',
    };

    console.log('✅ BODY ENVOYÉ À HERA =>', req.body);

    return hera.requestLeave(req, res, next);
  } catch (error) {
    console.error('❌ Erreur route VAPI /request-leave:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: '❌ Erreur serveur : ' + error.message,
    });
  }
});
// ══════════════════════════════════════════════════════════════════════════
router.get('/admin/all-actions',           hera.getAllActions);
router.delete('/admin/action/:action_id',  hera.deleteAction);
// ══════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN
// ══════════════════════════════════════════════════════════════════════════

router.get ('/admin/stats',              hera.getAdminStats);
router.get ('/admin/employees',          hera.getAllEmployees);
router.get ('/admin/recent-actions',     hera.getRecentActions);

module.exports = router;