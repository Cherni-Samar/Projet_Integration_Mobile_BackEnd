// controllers/dexoController.js
const dexoService = require('../services/dexoService');
const HeraAction = require('../models/HeraAction');
const heraAgent = require('../services/hera.agent');
const ProjectOpportunity = require('../models/ProjectOpportunity');
const User = require('../models/User');
const Employee = require('../models/Employee');
const { triggerStaffingForUser } = require('../services/staffingEventService');
const Document = require('../models/Document');
const crypto = require('crypto');
const pdfGenerator = require('../services/pdfGenerator'); 
// 1. Dashboard & Briefing
exports.getDailyCheckUp = async (req, res) => {
  try {
    const report = await generateBriefingLogic();

    const actions = await HeraAction.find({
      ceo_id: req.user.id,
    })
      .sort({ created_at: -1 })
      .limit(3)
      .populate('employee_id');

    res.json({
      success: true,
      report,
      rawActions: actions,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// 2. Document Factory

exports.requestDocument = async (req, res) => {
  try {
    console.log('📥 request-doc body:', req.body);

    const { employeeId, docType, details } = req.body;

    if (!employeeId || !docType) {
      return res.status(400).json({
        success: false,
        message: 'employeeId et docType requis',
      });
    }

    const result = await dexoService.processDocumentRequest({
      employeeId,
      docType,
      details: details || {},
    });

    res.json({
      success: true,
      message: 'Document généré avec succès',
      ...result,
    });
  } catch (err) {
    console.error('🔥 requestDocument error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// 3. Project Analysis & Approval
exports.analyzeAndRouteEmail = async (emailId) => {
  const InboxEmail = require('../models/InboxEmail');
  const email = await InboxEmail.findById(emailId);
  return await dexoService.analyzeProjectProposal(email);
};

exports.approveProject = async (req, res) => {
  try {
    const { projectId } = req.body;
    const project = await ProjectOpportunity.findByIdAndUpdate(projectId, { status: 'approved' });
await HeraAction.create({
  ceo_id: req.user.id,
  action_type: 'absence_alert',
  details: { department: project.department },
});
    res.json({ success: true, message: "Projet approuvé" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// 4. Strategic Onboarding
exports.getStrategicAdvice = async (req, res) => {
  try {
    const data = await dexoService.getStrategicAdvice(req.body.messages);
    res.json({ success: true, ...data });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Helpers Logs (Gardé intact)
exports.getDocumentActions = async (req, res) => {
  try {
    const actions = await HeraAction.find({
      ceo_id: req.user.id, // 🔥 FIX
      action_type: 'doc_request',
    })
      .populate('employee_id')
      .sort({ created_at: -1 });

    res.json({
      success: true,
      actions,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

exports.getOpportunities = async (req, res) => {
  const interactions = await ProjectOpportunity.find().sort({ createdAt: -1 });
  res.json({ success: true, interactions });
};

exports.saveVision = async (req, res) => {
  try {
    const { email, vision, workforceSettings } = req.body;

    if (!email || !vision || !Array.isArray(workforceSettings)) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
      });
    }

    const user = await User.findOneAndUpdate(
      { email },
      {
        companyVision: vision,
        workforceSettings,
      },
      { new: true }
    );

if (!user) {
  return res.status(404).json({
    success: false,
    error: 'user_not_found',
  });
}

triggerStaffingForUser(user._id).catch((err) => {
  console.warn('⚠️ Staffing trigger après saveVision:', err.message);
});

res.json({
  success: true,
  message: 'Vision sauvegardée',
  data: { user },
});
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
exports.getWorkforceSettings = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select(
      'companyVision workforceSettings'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'user_not_found',
      });
    }

    res.json({
      success: true,
      data: {
        companyVision: user.companyVision,
        workforceSettings: user.workforceSettings || [],
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

exports.updateWorkforceSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workforceSettings } = req.body;

    if (!Array.isArray(workforceSettings)) {
      return res.status(400).json({
        success: false,
        error: 'workforceSettings must be an array',
      });
    }

    const cleanedSettings = workforceSettings.map((item) => ({
      department: item.department || item.name || 'Department',
      targetCount: Number(item.targetCount || 0),
      currentCount: Number(item.currentCount || 0),
    }));

    const user = await User.findByIdAndUpdate(
      userId,
      {
        workforceSettings: cleanedSettings,
      },
      {
        new: true,
      }
    );

   if (!user) {
  return res.status(404).json({
    success: false,
    error: 'user_not_found',
  });
}

triggerStaffingForUser(user._id).catch((err) => {
  console.warn('⚠️ Staffing trigger après updateWorkforceSettings:', err.message);
});

res.json({
  success: true,
  message: 'Workforce settings updated',
  data: {
    workforceSettings: user.workforceSettings,
  },
});
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
// ===============================
// ✅ DEXO BRIEFING LOGIC (IMPORTANT)
// ===============================
exports.getDailyCheckUp = async (req, res) => {
  try {
    const report = await generateBriefingLogic();

    const actions = await HeraAction.find()
      .sort({ created_at: -1 })
      .limit(3)
      .populate('employee_id');

    res.json({
      success: true,
      report,
      rawActions: actions,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
const generateBriefingLogic = async () => {
  const actions = await HeraAction.find()
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
      .join(', ')} à cause d’un budget Salaries insuffisant.\n`;
  }

  if (documents.length > 0) {
    report += `DEXO a traité ${documents.length} demande(s) documentaire(s).\n`;
  }

  if (onboarding.length > 0) {
    report += `${onboarding.length} onboarding(s) ont été lancés.\n`;
  }

  report += `\n🎯 Recommandation : exécuter les recrutements validés, prioriser les départements partiellement approuvés, puis réviser le budget Salaries pour débloquer les postes restants.`;

  return report;
};

exports.generateBriefingLogic = generateBriefingLogic;

