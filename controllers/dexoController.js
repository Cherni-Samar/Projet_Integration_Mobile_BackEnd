// controllers/dexoController.js
const dexoService = require('../services/dexo/dexoService');
const briefingService = require('../services/dexo/briefing.service');
const HeraAction = require('../models/HeraAction');
const ProjectOpportunity = require('../models/ProjectOpportunity');
const User = require('../models/User');
const Document = require('../models/Document');
const { triggerStaffingForUser } = require('../services/hera/staffingEventService');

// ── Document Factory ──────────────────────────────────────────────────────────

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
        onboardingCompleted: true, // ✅ Set flag to true
      },
      { new: true }
    );

if (!user) {
  return res.status(404).json({
    success: false,
    error: 'user_not_found',
  });
}

// ✅ HERA ACCESS CONTROL: Only trigger staffing if user has purchased HERA
if (user.activeAgents?.includes('hera')) {
  triggerStaffingForUser(user._id).catch((err) => {
    console.warn('⚠️ Staffing trigger après saveVision:', err.message);
  });
} else {
  console.log(`⛔ HERA blocked: User ${user._id} hasn't purchased HERA - skipping staffing trigger`);
}

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
    const report = await briefingService.generateCEOBriefing(req.user.id);

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

// ── Document Category Browsing ────────────────────────────────────────────────

// GET /api/dexo/documents-by-category
// Returns active documents owned by the authenticated CEO, optionally filtered
// by category, with pagination via limit/offset.
exports.getDocumentsByCategory = async (req, res) => {
  try {
    const ceoId = req.user.id;
    const category = req.query.category;
    const limit  = Math.max(1, parseInt(req.query.limit)  || 20);
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    const filter = {
      uploadedBy: ceoId,
      status: 'active',
    };

    if (category) {
      filter.category = category;
    }

    const [documents, total] = await Promise.all([
      Document.find(filter)
        .sort({ uploadedAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Document.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      documents,
      pagination: { total, limit, offset },
    });
  } catch (err) {
    console.error('❌ getDocumentsByCategory error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/dexo/document-content/:id
// Returns a single active document owned by the authenticated CEO.
// Returns 404 if the document does not exist or belongs to another CEO.
exports.getDocumentContent = async (req, res) => {
  try {
    const ceoId = req.user.id;
    const { id } = req.params;

    const document = await Document.findOne({
      _id: id,
      uploadedBy: ceoId,
      status: 'active',
    }).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document introuvable ou accès refusé',
      });
    }

    return res.json({ success: true, document });
  } catch (err) {
    console.error('❌ getDocumentContent error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
