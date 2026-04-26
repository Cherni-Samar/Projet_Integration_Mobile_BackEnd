const Employee = require('../models/Employee');
const HeraAction = require('../models/HeraAction');
const InboxEmail = require('../models/InboxEmail');
const User = require('../models/User');
const mailService = require('../utils/emailService');
const ActivityLog = require('../models/ActivityLog');

const triggerStaffingForUser = async (userId) => {
  console.log(`🧠 [HERA EVENT] Analyse staffing globale pour user ${userId}`);

  const user = await User.findById(userId);
  if (!user || !user.workforceSettings?.length) return;

  const needs = [];

  // 1. Collecter tous les besoins
  for (const dept of user.workforceSettings) {
    const department = dept.department;
    const target = Number(dept.targetCount || 0);

    if (!department || target <= 0) continue;

    const current = await Employee.countDocuments({
      ceo_id: user._id,
      department,
      status: 'active',
    });

    const missing = target - current;
    if (missing <= 0) continue;

    const alreadyNotified = await HeraAction.findOne({
      ceo_id: user._id,
      action_type: 'absence_alert',
      'details.department': department,
    });

    if (alreadyNotified) continue;

    needs.push({
      department,
      current,
      target,
      missing,
    });
  }

  if (needs.length === 0) {
    console.log('✅ Aucun besoin staffing détecté');
    return;
  }

  // 2. Log Hera → Kash
  await ActivityLog.logActivity({
    sourceAgent: 'hera',
    targetAgent: 'kash',
    actionType: 'STAFFING_ALERT',
    title: `Hera détecte ${needs.length} besoin(s) de staffing`,
    description: needs
      .map(n => `${n.department}: ${n.current}/${n.target}, manque ${n.missing}`)
      .join('\n'),
    status: 'success',
    priority: 'high',
    metadata: {
      userId: user._id.toString(),
      additionalData: { needs },
    },
  });

  // 3. Appeler Kash allocation globale
  let allocation;

  try {
    await ActivityLog.logActivity({
      sourceAgent: 'kash',
      targetAgent: 'hera',
      actionType: 'BUDGET_ANALYSIS',
      title: 'Kash analyse l’allocation globale du budget Salaries',
      description: 'Analyse globale des besoins de recrutement par priorité métier.',
      status: 'in_progress',
      priority: 'medium',
      metadata: {
        userId: user._id.toString(),
        additionalData: { needs },
      },
    });

    const kashBaseUrl =
      process.env.KASH_API_URL || 'http://localhost:3000/api/kash';

    const kashResponse = await fetch(`${kashBaseUrl}/staffing-allocation-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user._id.toString(),
        needs,
      }),
    });

    const kashResult = await kashResponse.json();

    if (!kashResult.success) {
      await ActivityLog.logActivity({
        sourceAgent: 'kash',
        targetAgent: 'hera',
        actionType: 'BUDGET_ANALYSIS',
        title: 'Kash allocation échouée',
        description: kashResult.message || kashResult.error || 'Erreur allocation budget.',
        status: 'failed',
        priority: 'high',
        metadata: {
          userId: user._id.toString(),
          additionalData: kashResult,
        },
      });

      return;
    }

    allocation = kashResult.allocation;

    await ActivityLog.logActivity({
      sourceAgent: 'kash',
      targetAgent: 'hera',
      actionType: 'BUDGET_ANALYSIS',
      title: 'Kash a terminé l’allocation staffing',
      description: allocation.recommendation,
      status: allocation.approved?.length ? 'success' : 'failed',
      priority: allocation.approved?.length ? 'medium' : 'high',
      metadata: {
        userId: user._id.toString(),
        additionalData: allocation,
      },
    });
  } catch (err) {
    console.warn('⚠️ Kash allocation error:', err.message);

    await ActivityLog.logActivity({
      sourceAgent: 'kash',
      targetAgent: 'hera',
      actionType: 'BUDGET_ANALYSIS',
      title: 'Erreur Kash allocation',
      description: err.message,
      status: 'failed',
      priority: 'high',
      metadata: {
        userId: user._id.toString(),
      },
    });

    return;
  }

  // 4. Créer logs/actions pour les recrutements bloqués
  for (const blocked of allocation.blocked || []) {
    await HeraAction.create({
      ceo_id: user._id,
      action_type: 'performance_alert',
      triggered_by: 'kash_auto',
      details: {
        type: 'staffing_budget_blocked',
        department: blocked.department,
        kashAnalysis: blocked,
      },
    });

    await ActivityLog.logActivity({
      sourceAgent: 'kash',
      targetAgent: 'hera',
      actionType: 'BUDGET_ANALYSIS',
      title: `Kash bloque ${blocked.blocked} recrutement(s) en ${blocked.department}`,
      description: blocked.reason || 'Budget Salaries insuffisant.',
      status: 'failed',
      priority: 'high',
      metadata: {
        userId: user._id.toString(),
        department: blocked.department,
        additionalData: blocked,
      },
    });

    console.log(`🚫 Recrutement bloqué pour ${blocked.department}: ${blocked.blocked}`);
  }

  // 5. Déclencher Echo uniquement pour les approuvés
  for (const approved of allocation.approved || []) {
    const originalNeed = needs.find(n => n.department === approved.department);

    if (!originalNeed || approved.approved <= 0) continue;

    const mailContent =
      `Besoin de recrutement validé en ${approved.department}. ` +
      `Kash a approuvé ${approved.approved}/${approved.requested} recrutement(s). ` +
      `Coût estimé : ${approved.estimatedCost} TND.`;

    const subject = `📢 RECRUTEMENT VALIDÉ : ${approved.department}`;

    const heraEmail = await InboxEmail.create({
      ownerId: user._id,
      subject,
      sender: 'hera@e-team.com',
      to: 'echo@e-team.com',
      content: mailContent,
      priority: 'high',
      isUrgent: true,
      category: 'recruitment',
      source: 'receive',
      isRead: false,
    });

    await HeraAction.create({
      ceo_id: user._id,
      action_type: 'absence_alert',
      triggered_by: 'hera_auto',
      details: {
        department: approved.department,
        current: originalNeed.current,
        target: originalNeed.target,
        missing: originalNeed.missing,
        approvedCount: approved.approved,
        message: mailContent,
        emailId: heraEmail._id,
      },
    });

    await HeraAction.create({
      ceo_id: user._id,
      action_type: 'performance_alert',
      triggered_by: 'kash_auto',
      details: {
        type: 'staffing_budget_approved',
        department: approved.department,
        kashAnalysis: approved,
      },
    });

    await ActivityLog.logActivity({
      sourceAgent: 'kash',
      targetAgent: 'echo',
      actionType: 'BUDGET_ANALYSIS',
      title: `Kash valide ${approved.approved} recrutement(s) en ${approved.department}`,
      description: `Budget validé pour ${approved.approved}/${approved.requested} recrutement(s).`,
      status: 'success',
      priority: 'medium',
      metadata: {
        userId: user._id.toString(),
        department: approved.department,
        additionalData: approved,
      },
    });

    await mailService.sendStaffingAlert('echo-agent@e-team.com', {
      department: approved.department,
      count: originalNeed.current,
      max: originalNeed.target,
      message: mailContent,
    });

    try {
      const echoBaseUrl =
        process.env.ECHO_API_URL || 'http://localhost:3000/api/echo';

      await fetch(`${echoBaseUrl}/receive-staffing-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id.toString(),
          emailId: heraEmail._id.toString(),
          department: approved.department,
          currentCount: originalNeed.current,
          maxCapacity: originalNeed.target,
          shortage: approved.approved,
          kashAnalysis: approved,
        }),
      });

      await ActivityLog.logActivity({
        sourceAgent: 'echo',
        targetAgent: 'system',
        actionType: 'RECRUITMENT',
        title: `Echo lance le recrutement en ${approved.department}`,
        description: `Echo lance ${approved.approved} recrutement(s) validé(s) par Kash.`,
        status: 'success',
        priority: 'high',
        metadata: {
          userId: user._id.toString(),
          department: approved.department,
          emailId: heraEmail._id.toString(),
          additionalData: approved,
        },
      });

      console.log(`💼 Echo déclenché pour ${approved.department}`);
    } catch (err) {
      console.warn('⚠️ Echo error:', err.message);

      await ActivityLog.logActivity({
        sourceAgent: 'echo',
        targetAgent: 'system',
        actionType: 'RECRUITMENT',
        title: `Echo a échoué pour ${approved.department}`,
        description: err.message,
        status: 'failed',
        priority: 'high',
        metadata: {
          userId: user._id.toString(),
          department: approved.department,
          emailId: heraEmail._id.toString(),
        },
      });
    }
  }
};

module.exports = { triggerStaffingForUser };