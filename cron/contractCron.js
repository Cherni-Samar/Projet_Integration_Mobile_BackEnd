const cron = require('node-cron');
const Employee = require('../models/Employee');
const LeaveRequest = require('../models/LeaveRequest');
const HeraAction = require('../models/HeraAction');
const n8n = require('./hera/n8n.service');
const mailService = require('../utils/emailService');

// ── Utilitaire : donne la plage de dates pour J+X ─────────────────────────
function getDateRange(daysFromNow) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  const next = new Date(date);
  next.setDate(date.getDate() + 1);
  return { from: date, to: next };
}

// ── Fonction principale ───────────────────────────────────────────────────
async function checkExpiringContracts() {
  console.log('🤖 HERA CRON : Vérification des contrats...');

  // ── 1. Alerte J-30 ───────────────────────────────────────────────────────
  const { from: from30, to: to30 } = getDateRange(30);
  const expiring30 = await Employee.find({
    'contract.type': { $in: ['CDD', 'Stage'] },
    'contract.end': { $gte: from30, $lt: to30 },
    status: 'active'
  });

  for (const emp of expiring30) {
    console.log(`📅 Contrat expire dans 30 jours : ${emp.name}`);
    try {
    // Au lieu de await n8n.offboarding(...)
    await mailService.sendLeaveNotification(emp.email, {
   employee_name: emp.name,
   status: 'refused', // Ou un nouveau template 'alert'
   reason_decision: "Votre contrat arrive à échéance prochainement.",
   start_date: "Attention",
   end_date: emp.contract.end,
   days: 0
   });
    } catch (e) {
      console.error('⚠️ Erreur mail J-30:', e.message);
    }
  }

  // ── 2. Alerte J-7 ────────────────────────────────────────────────────────
  const { from: from7, to: to7 } = getDateRange(7);
  const expiring7 = await Employee.find({
    'contract.type': { $in: ['CDD', 'Stage'] },
    'contract.end': { $gte: from7, $lt: to7 },
    status: 'active'
  });

  for (const emp of expiring7) {
    console.log(`⚠️ Contrat expire dans 7 jours : ${emp.name}`);
    try {
      await n8n.offboarding({
        employee_name: emp.name,
        employee_email: emp.email,
        manager_email: emp.manager_email,
        reason: 'contract_expiring_urgent',
        last_day: emp.contract.end,
        alert_type: 'J-7'
      });
    } catch (e) {
      console.error('⚠️ Erreur mail J-7:', e.message);
    }
  }

  // ── 3. Offboarding automatique J-0 ───────────────────────────────────────
  const { from: today, to: tomorrow } = getDateRange(0);
  const expired = await Employee.find({
    'contract.type': { $in: ['CDD', 'Stage'] },
    'contract.end': { $gte: today, $lt: tomorrow },
    status: 'active'
  });

  for (const emp of expired) {
    console.log(`🚪 Offboarding automatique : ${emp.name}`);

    // Status → offboarding
    await Employee.findByIdAndUpdate(emp._id, {
      status: 'offboarding',
      updated_at: new Date()
    });

    // Annuler ses congés en attente
    const cancelled = await LeaveRequest.updateMany(
      { employee_id: emp._id, status: 'pending' },
      { 
        status: 'refused', 
        approved_by: 'Hera (auto - offboarding)' 
      }
    );
    console.log(`❌ ${cancelled.modifiedCount} congé(s) annulé(s)`);

    // Log dans HeraAction
    await HeraAction.create({
      employee_id: emp._id,
      action_type: 'offboarding_started',
      details: {
        reason: 'contract_end',
        last_day: emp.contract.end,
        contract_type: emp.contract.type,
        auto: true
      },
      triggered_by: 'hera_auto'
    });

    // Envoyer mails
    try {
      await n8n.offboarding({
        employee_name: emp.name,
        employee_email: emp.email,
        manager_email: emp.manager_email,
        reason: 'contract_end',
        last_day: emp.contract.end,
        alert_type: 'J-0'
      });
    } catch (e) {
      console.error('⚠️ Erreur mail offboarding:', e.message);
    }

    // Bloquer l'accès
    await Employee.findByIdAndUpdate(emp._id, {
      status: 'inactive',
      password: null,
      updated_at: new Date()
    });

    await HeraAction.create({
      employee_id: emp._id,
      action_type: 'offboarding_completed',
      details: { reason: 'contract_end', completed_at: new Date() },
      triggered_by: 'hera_auto'
    });

    console.log(`✅ ${emp.name} → inactive, accès bloqué`);
  }
}

// ── Démarrer le cron ──────────────────────────────────────────────────────
function startContractCron() {
  cron.schedule('5 0 * * *', async () => {
    try {
      await checkExpiringContracts();
    } catch (err) {
      console.error('❌ Erreur cron:', err.message);
    }
  });

  console.log('⏰ Cron contrats démarré (chaque jour à 00:05)');
}

module.exports = { startContractCron, checkExpiringContracts };