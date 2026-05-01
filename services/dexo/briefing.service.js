const HeraAction = require('../../models/HeraAction');

/**
 * Dexo Briefing Service - CEO briefing and reporting logic
 * Extracted from dexoController.js for better separation of concerns
 */

/**
 * Generate CEO briefing based on recent HeraActions
 * @param {string} userId - CEO user ID
 * @returns {Promise<string>} - Formatted briefing report
 */
async function generateCEOBriefing(userId) {
  const actions = await HeraAction.find({
    ceo_id: userId,
  })
    .sort({ created_at: -1 })
    .limit(50)
    .populate('employee_id');

  if (!actions || actions.length === 0) {
    return "🏢 Statut calme. Aucun événement majeur à signaler.";
  }

  const staffingAlerts = actions.filter(
    a => a.action_type === 'absence_alert'
  );

  const kashDecisions = actions.filter(
    a => a.action_type === 'performance_alert'
  );

  const approved = kashDecisions.filter(
    a => a.details?.type === 'staffing_budget_approved'
  );

  const blocked = kashDecisions.filter(
    a => a.details?.type === 'staffing_budget_blocked'
  );

  const approvedMap = {};
  const blockedMap = {};

  for (const a of approved) {
    const dept = a.details?.department;
    const approvedCount =
      Number(a.details?.kashAnalysis?.approved || a.details?.kashAnalysis?.approvedCount || 0);

    if (!dept) continue;

    approvedMap[dept] = {
      department: dept,
      approved: approvedCount || 1,
      estimatedCost: Number(a.details?.kashAnalysis?.estimatedCost || 0),
    };
  }

  for (const a of blocked) {
    const dept = a.details?.department;
    const blockedCount =
      Number(a.details?.kashAnalysis?.blocked || a.details?.kashAnalysis?.blockedCount || 0);

    if (!dept) continue;

    blockedMap[dept] = {
      department: dept,
      blocked: blockedCount || 1,
      reason: a.details?.kashAnalysis?.reason || 'Budget Salaries insuffisant',
    };
  }

  const fullyApproved = [];
  const partiallyApproved = [];
  const fullyBlocked = [];

  const allDepartments = new Set([
    ...Object.keys(approvedMap),
    ...Object.keys(blockedMap),
  ]);

  for (const dept of allDepartments) {
    const approvedDept = approvedMap[dept];
    const blockedDept = blockedMap[dept];

    if (approvedDept && blockedDept) {
      partiallyApproved.push({
        department: dept,
        approved: approvedDept.approved,
        blocked: blockedDept.blocked,
      });
    } else if (approvedDept) {
      fullyApproved.push(approvedDept);
    } else if (blockedDept) {
      fullyBlocked.push(blockedDept);
    }
  }

  const documents = actions.filter(a => a.action_type === 'doc_request');
  const onboarding = actions.filter(a => a.action_type === 'onboarding_started');

  let report = `📌 Briefing CEO DEXO\n\n`;

  report += `Hera a détecté ${staffingAlerts.length} besoin(s) de staffing.\n`;

  if (fullyApproved.length > 0) {
    report += `Kash a validé totalement le recrutement pour : ${fullyApproved
      .map(d => d.department)
      .join(', ')}.\n`;
  }

  if (partiallyApproved.length > 0) {
    report += `Kash a validé partiellement : ${partiallyApproved
      .map(d => `${d.department} (${d.approved} validé(s), ${d.blocked} bloqué(s))`)
      .join(', ')}.\n`;
  }

  if (fullyBlocked.length > 0) {
    report += `Kash a bloqué le recrutement pour : ${fullyBlocked
      .map(d => d.department)
      .join(', ')} à cause d'un budget Salaries insuffisant.\n`;
  }

  if (documents.length > 0) {
    report += `DEXO a traité ${documents.length} demande(s) documentaire(s).\n`;
  }

  if (onboarding.length > 0) {
    report += `${onboarding.length} onboarding(s) ont été lancés.\n`;
  }

  report += `\n🎯 Recommandation : exécuter les recrutements validés, prioriser les départements partiellement approuvés, puis réviser le budget Salaries pour débloquer les postes restants.`;

  return report;
}

module.exports = {
  generateCEOBriefing,
};