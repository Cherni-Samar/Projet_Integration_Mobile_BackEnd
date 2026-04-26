const Employee = require('../models/Employee');
const HeraAction = require('../models/HeraAction');
const InboxEmail = require('../models/InboxEmail');
const User = require('../models/User');
const mailService = require('../utils/emailService');
const ActivityLog = require('../models/ActivityLog');

const triggerStaffingForUser = async (userId) => {
  console.log(`🧠 [HERA EVENT] Analyse staffing pour user ${userId}`);

  const user = await User.findById(userId);
  if (!user || !user.workforceSettings?.length) return;
  let approvedRecruitmentCost = 0;

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

    const mailContent =
      `Besoin de recrutement en ${department}. ` +
      `L'effectif actuel est à ${current}/${target}. ` +
      `Il manque ${missing} collaborateur(s).`;

    const subject = `📢 ALERTE RECRUTEMENT : ${department}`;

    await ActivityLog.logActivity({
      sourceAgent: 'hera',
      targetAgent: 'kash',
      actionType: 'STAFFING_ALERT',
      title: `Hera détecte un manque en ${department}`,
      description: mailContent,
      status: 'success',
      priority: 'high',
      metadata: {
        userId: user._id.toString(),
        department,
        additionalData: {
          current,
          target,
          missing,
        },
      },
    });

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
        department,
        current,
        target,
        missing,
        message: mailContent,
        emailId: heraEmail._id,
      },
    });

    let canAfford = false;
    let kashAnalysis = null;

    try {
      await ActivityLog.logActivity({
        sourceAgent: 'kash',
        targetAgent: 'hera',
        actionType: 'BUDGET_ANALYSIS',
        title: `Kash analyse le budget ${department}`,
        description: `Analyse du budget Salaries pour ${missing} recrutement(s).`,
        status: 'in_progress',
        priority: 'medium',
        metadata: {
          userId: user._id.toString(),
          department,
          additionalData: {
            current,
            target,
            missing,
          },
        },
      });

      const kashBaseUrl =
        process.env.KASH_API_URL || 'http://localhost:3000/api/kash';

      const kashResponse = await fetch(`${kashBaseUrl}/staffing-cost-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
  userId: user._id.toString(),
  department,
  currentCount: current,
  targetCount: target,
  missing,
  alreadyApprovedCost: approvedRecruitmentCost,
}),
      });

      const kashResult = await kashResponse.json();

      if (!kashResult.success) {
        await ActivityLog.logActivity({
          sourceAgent: 'kash',
          targetAgent: 'hera',
          actionType: 'BUDGET_ANALYSIS',
          title: `Kash n'a pas pu analyser ${department}`,
          description: kashResult.message || kashResult.error || 'Erreur analyse budget.',
          status: 'failed',
          priority: 'high',
          metadata: {
            userId: user._id.toString(),
            department,
            additionalData: kashResult,
          },
        });

        return;
      }

      kashAnalysis = kashResult.analysis;
      canAfford = kashAnalysis?.canAfford === true;
      if (canAfford) {
  approvedRecruitmentCost += Number(kashAnalysis?.estimatedMonthlyCost || 0);
}

      await ActivityLog.logActivity({
        sourceAgent: 'kash',
        targetAgent: canAfford ? 'echo' : 'hera',
        actionType: 'BUDGET_ANALYSIS',
        title: canAfford
          ? `Kash valide le recrutement en ${department}`
          : `Kash bloque le recrutement en ${department}`,
        description:
          kashAnalysis?.recommendation ||
          (canAfford
            ? `Budget suffisant pour recruter ${missing} collaborateur(s).`
            : `Budget insuffisant pour recruter ${missing} collaborateur(s).`),
        status: canAfford ? 'success' : 'failed',
        priority: canAfford ? 'medium' : 'high',
        metadata: {
          userId: user._id.toString(),
          department,
          additionalData: kashAnalysis,
        },
      });

      await HeraAction.create({
        ceo_id: user._id,
        action_type: 'performance_alert',
        triggered_by: 'kash_auto',
        details: {
          type: canAfford
            ? 'staffing_budget_approved'
            : 'staffing_budget_blocked',
          department,
          kashAnalysis,
        },
      });
    } catch (e) {
      console.warn('⚠️ Kash error:', e.message);

      await ActivityLog.logActivity({
        sourceAgent: 'kash',
        targetAgent: 'hera',
        actionType: 'BUDGET_ANALYSIS',
        title: `Erreur Kash pour ${department}`,
        description: e.message,
        status: 'failed',
        priority: 'high',
        metadata: {
          userId: user._id.toString(),
          department,
        },
      });

      return;
    }

    if (!canAfford) {
      console.log(`🚫 Recrutement bloqué pour ${department}`);
      continue;
    }

    console.log(`✅ Kash validé, Echo peut recruter pour ${department}`);

    await mailService.sendStaffingAlert('echo-agent@e-team.com', {
      department,
      count: current,
      max: target,
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
          department,
          currentCount: current,
          maxCapacity: target,
          shortage: missing,
          kashAnalysis,
        }),
      });

      await ActivityLog.logActivity({
        sourceAgent: 'echo',
        targetAgent: 'system',
        actionType: 'RECRUITMENT',
        title: `Echo lance le recrutement en ${department}`,
        description: `Recrutement autorisé par Kash pour ${missing} collaborateur(s).`,
        status: 'success',
        priority: 'high',
        metadata: {
          userId: user._id.toString(),
          department,
          emailId: heraEmail._id.toString(),
          additionalData: {
            missing,
            kashAnalysis,
          },
        },
      });

      console.log(`💼 Echo déclenché pour ${department}`);
    } catch (err) {
      console.warn('⚠️ Echo error:', err.message);

      await ActivityLog.logActivity({
        sourceAgent: 'echo',
        targetAgent: 'system',
        actionType: 'RECRUITMENT',
        title: `Echo a échoué pour ${department}`,
        description: err.message,
        status: 'failed',
        priority: 'high',
        metadata: {
          userId: user._id.toString(),
          department,
          emailId: heraEmail._id.toString(),
        },
      });
    }
  }
};

module.exports = { triggerStaffingForUser };