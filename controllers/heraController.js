const Employee = require('../models/Employee');
const LeaveRequest = require('../models/LeaveRequest');
const HeraAction = require('../models/HeraAction');
const User = require('../models/User');
const mailService = require('../utils/emailService'); // Chemin corrigé selon ton projet
const heraAgent = require('../services/hera.agent'); // Ton service LangChain
const JobOffer = require('../models/JobOffer');
const Candidate = require('../models/Candidate');
// 💡 DÉFINITION DES LIMITES (Indispensable pour check-staffing)
const DEPARTMENT_LIMITS = {
  Tech: { max_employees: 20, max_interns: 2 },
  Design: { max_employees: 10, max_interns: 1 },
  Marketing: { max_employees: 15, max_interns: 2 },
  RH: { max_employees: 5, max_interns: 0 },
  Finance: { max_employees: 8, max_interns: 0 },
  Support: { max_employees: 12, max_interns: 1 },
  Management: { max_employees: 10, max_interns: 0 },
};
// ══════════════════════════════════════════════════════════════════════════
// HELPERS INTERNES
// ══════════════════════════════════════════════════════════════════════════

function calculateDays(start, end) {
  return Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)) + 1;
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function computeContractEnd(contractType, startDate) {
  const durations = { CDI: null, CDD: 12, Stage: 6, Freelance: 12 };
  const months = durations[contractType];
  if (months === null || months === undefined) return null;
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + months);
  return d;
}
// Cette route sera appelée par Vapi automatiquement
exports.vapiWebhook = async (req, res) => {
  try {
    const payload = req.body;
    
    // 1. Récupérer le message texte de l'admin depuis Vapi
    const userMessage = payload.message?.toolCalls?.[0]?.function?.arguments?.message 
                     || payload.message?.transcript 
                     || "";

    if (!userMessage) {
      return res.json({ message: "Je vous écoute, comment puis-je aider l'équipe RH ?" });
    }

    // 2. Utiliser ton agent LangChain pour analyser le message (comme on a fait avant)
    const analysis = await heraAgent.analyze(userMessage);

    let finalReply = analysis.reply;

    // 3. Si l'IA détecte une demande de congé via la voix
    if (analysis.intent === "LEAVE_REQUEST") {
      const employee = await Employee.findOne({ name: new RegExp(analysis.data.employee_name, 'i') });
      
      if (employee) {
        const result = await executeLeaveDecision({
          employee_id: employee._id,
          type: analysis.data.type || 'annual',
          start_date: analysis.data.start_date,
          end_date: analysis.data.end_date,
          reason: "Accordé par l'Admin via Voice"
        });
        finalReply = `C'est fait. J'ai traité la demande pour ${employee.name}. ${result.message}`;
      } else {
        finalReply = `Je n'ai pas trouvé l'employé ${analysis.data.employee_name} dans la base de données.`;
      }
    } 
    
    // 4. Si l'admin demande de vérifier le staffing ("Hera, vérifie si on manque de monde")
    else if (userMessage.toLowerCase().includes("staffing") || userMessage.toLowerCase().includes("recrutement")) {
      await exports.checkStaffingNeeds(req, res); // Appelle ta fonction qui mail Echo
      finalReply = "J'ai analysé les départements. Des alertes de recrutement ont été envoyées à l'agent Echo pour les postes manquants.";
    }

    // 5. Répondre à Vapi (format spécifique pour que Hera parle)
    return res.json({
      results: [
        {
          toolCallId: payload.message?.toolCalls?.[0]?.id,
          result: finalReply
        }
      ]
    });

  } catch (err) {
    console.error("Vapi Error:", err);
    res.json({ result: "Désolée, j'ai rencontré une erreur technique." });
  }
};
// ── FONCTION : CHECK STAFFING ──
exports.checkStaffingNeeds = async (req, res) => {
  try {
    const report = [];
    const departments = Object.keys(DEPARTMENT_LIMITS);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    for (const dept of departments) {
      const count = await Employee.countDocuments({ department: dept, status: 'active' });
      const limit = DEPARTMENT_LIMITS[dept].max_employees;

      // 1. Détection du manque
      if (count < limit * 0.8) {
        
        // 2. 🛡️ ANTI-SPAM : Vérifier si Hera a déjà alerté Echo pour ce département AUJOURD'HUI
        const alreadyNotified = await HeraAction.findOne({
          action_type: 'absence_alert',
          'details.department': dept,
          created_at: { $gte: startOfToday }
        });

        if (alreadyNotified) {
          report.push({ dept, status: 'Déjà notifié aujourd\'hui', count });
          continue; // On passe au département suivant sans envoyer de mail
        }

        // 3. Si pas encore notifié, on envoie le mail
        await mailService.sendWelcomeEmail(
          "echo-agent@e-team.com", 
          `Hera : Alerte Recrutement ${dept}`, 
          `Besoin en ${dept}. Merci de poster une annonce.`
        );

        // 4. On enregistre l'action pour s'en souvenir
        await HeraAction.create({
          action_type: 'absence_alert',
          details: { department: dept, count: count, limit: limit },
          triggered_by: 'hera_auto'
        });

        report.push({ dept, status: 'Echo notifié (Nouveau)', count });
      } else {
        report.push({ dept, status: 'Staffing OK', count });
      }
    }
    
    res.json({ success: true, report });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── FONCTION : CANDIDATURE (ATS) ──
exports.processCandidacy = async (req, res) => {
  try {
    const { name, email, job_offer_id } = req.body;
    const score = Math.floor(Math.random() * 100); 
    let status = 'applied';
    let meeting_link = null;

    if (score > 70) {
      status = 'interview_scheduled';
      meeting_link = `https://meet.e-team.com/${Math.random().toString(36).substring(7)}`;
      await mailService.sendWelcomeEmail(email, name); // Envoi d'un mail au candidat
    }

    const candidate = await Candidate.create({ name, email, job_offer_id, status, score_ia: score, meeting_link });
    res.json({ success: true, score_ia: score, status, meeting_link, candidate });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── 2. GÉNÉRATION DE DOCUMENTS (CONTRAT / ATTESTATION) ────────────────────
exports.generateHeraDoc = async (req, res) => {
  try {
    const { employee_id, doc_type } = req.body; // doc_type: 'contract' ou 'attestation'
    const employee = await Employee.findById(employee_id);
    
    if (!employee) return res.status(404).json({ message: "Employé non trouvé" });

    const today = new Date().toLocaleDateString();
    let content = "";

    if (doc_type === 'attestation') {
      content = `ATTESTATION D'EMPLOI\n\nJe soussigné, Hera (IA RH), certifie que ${employee.name} est employé au sein de E-Team au poste de ${employee.role}.\nFait le ${today}.`;
    } else {
      content = `CONTRAT DE TRAVAIL - E-TEAM\n\nEntre E-Team et ${employee.name}.\nPoste : ${employee.role}\nDépartement : ${employee.department}\nSalaire : ${employee.salary}€`;
    }

    // Log de l'action
    await HeraAction.create({
      employee_id,
      action_type: doc_type === 'contract' ? 'contract_renewal' : 'performance_alert',
      details: { doc_content: content },
      triggered_by: 'hera_auto'
    });

    res.json({ success: true, type: doc_type, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// ══════════════════════════════════════════════════════════════════════════
// LOGIQUE DE DÉCISION RH (Utilisée par Chat Admin ET Formulaire Employé)
// ══════════════════════════════════════════════════════════════════════════

async function executeLeaveDecision(data) {
  const { employee_id, type, start_date, end_date, reason } = data;
  
  const start = new Date(start_date);
  const end = new Date(end_date);
  const days = calculateDays(start, end);

  // 1. Vérification de l'employé
  const employee = await Employee.findById(employee_id);
  if (!employee) return { success: false, message: "Employé non trouvé." };

  // 2. Vérification Solde
  const balance = employee.leave_balance?.[type] || 0;
  const used = employee.leave_balance_used?.[type] || 0;
  const remaining = balance - used;

  if (days > remaining) {
    const refusal_reason = `Solde insuffisant (${remaining}j restants).`;
    
    // ✅ ENVOI EMAIL DE REFUS (Solde)
    await mailService.sendLeaveNotification(employee.email, {
      employee_name: employee.name,
      start_date: start_date,
      end_date: end_date,
      status: 'refused',
      reason_decision: refusal_reason,
      days: days
    });

    return { success: false, message: refusal_reason };
  }

  // 3. Vérification Simultanée (Max 2 personnes)
  const simultaneousCount = await LeaveRequest.countDocuments({
    status: 'approved',
    employee_id: { $ne: employee_id },
    $or: [{ start_date: { $lte: end }, end_date: { $gte: start } }]
  });

  let status = 'approved';
  let decision_reason = 'Capacité OK';
  
  if (type !== 'urgent' && simultaneousCount >= 2) {
    status = 'refused';
    decision_reason = `Refusé : Déjà ${simultaneousCount} personnes en congé.`;
  }

  // 4. Débit Énergie (5 unités sur le manager)
  await User.findOneAndUpdate(
    { email: normalizeEmail(employee.manager_email), energyBalance: { $gte: 5 } },
    { $inc: { energyBalance: -5 } }
  );

  // 5. Sauvegarde Base de Données (Demande de congé)
  const leave = await LeaveRequest.create({
    employee_id,
    employee_email: employee.email,
    type,
    start_date: start,
    end_date: end,
    days,
    reason: reason || 'Demande RH',
    status
  });

  // 6. Enregistrement de l'action HeraAction
  await HeraAction.create({
    employee_id,
    action_type: status === 'approved' ? 'leave_approved' : 'leave_refused',
    details: { type, days, decision_reason, start_date, end_date },
    triggered_by: 'hera_auto'
  });

  // 7. Mise à jour du solde de l'employé si approuvé
  if (status === 'approved') {
    await Employee.findByIdAndUpdate(employee_id, { 
      $inc: { [`leave_balance_used.${type}`]: days } 
    });
  }

  // 8. ✅ ENVOI EMAIL FINAL (Approuvé ou Refusé par capacité)
  await mailService.sendLeaveNotification(employee.email, {
    employee_name: employee.name,
    start_date: start_date,
    end_date: end_date,
    status: status, // 'approved' ou 'refused'
    reason_decision: decision_reason,
    days: days
  });

  return { 
    success: true, 
    status, 
    message: `Décision : ${status}. ${decision_reason}`, 
    leave 
  };
}

// ══════════════════════════════════════════════════════════════════════════
// EXPORTS POUR LES ROUTES
// ══════════════════════════════════════════════════════════════════════════

exports.hello = async (req, res) => {
  res.json({ success: true, agent: 'Hera', message: 'Hello! Je suis Hera 👋' });
};

// Route pour l'Admin (Chat LangChain)
exports.chat = async (req, res) => {
  try {
    const { message } = req.body;
    const analysis = await heraAgent.analyze(message);

    if (analysis.intent === "LEAVE_REQUEST") {
      // Chercher l'employé par son nom extrait par l'IA
      const employee = await Employee.findOne({ name: new RegExp(analysis.data.employee_name, 'i') });
      if (!employee) return res.json({ success: true, agent: 'Hera', message: `Je ne trouve pas d'employé nommé "${analysis.data.employee_name}"` });

      const result = await executeLeaveDecision({
        employee_id: employee._id,
        type: analysis.data.type || 'annual',
        start_date: analysis.data.start_date,
        end_date: analysis.data.end_date,
        reason: analysis.data.reason || "Accordé par l'Admin"
      });

      return res.json({ success: true, agent: 'Hera', message: result.message });
    }
    res.json({ success: true, agent: 'Hera', message: analysis.reply });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Route pour l'Employé (Formulaire JSON)
exports.requestLeave = async (req, res) => {
  try {
    const result = await executeLeaveDecision(req.body);
    res.status(result.success ? 201 : 400).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.urgentLeave = async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  req.body.type = 'urgent';
  req.body.start_date = today;
  req.body.end_date = today;
  return exports.requestLeave(req, res);
};

exports.onboarding = async (req, res) => {
  try {
    const { name, email, role, contract_type, contract_start } = req.body;
    const normalizedEmail = normalizeEmail(email);
    
    // Calcul fin de contrat
    const startDate = contract_start ? new Date(contract_start) : new Date();
    const endDate = computeContractEnd(contract_type, startDate);

    const employee = await Employee.create({
      ...req.body,
      email: normalizedEmail,
      contract: { type: contract_type, start: startDate, end: endDate },
      status: 'onboarding'
    });

    res.status(201).json({ success: true, message: `Onboarding de ${name} créé`, employee_id: employee._id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getLeaves = async (req, res) => {
  try {
    const leaves = await LeaveRequest.find({ employee_id: req.params.employee_id }).sort({ created_at: -1 });
    res.json({ success: true, leaves });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getLeaveHistory = exports.getLeaves;

exports.getHistory = async (req, res) => {
  try {
    const actions = await HeraAction.find({ employee_id: req.params.employee_id }).sort({ created_at: -1 });
    res.json({ success: true, actions });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.promote = async (req, res) => {
  try {
    const { employee_id, new_role } = req.body;
    await Employee.findByIdAndUpdate(employee_id, { role: new_role });
    res.json({ success: true, message: "Promotion effectuée" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.offboarding = async (req, res) => {
  try {
    await Employee.findByIdAndUpdate(req.body.employee_id, { status: 'inactive' });
    res.json({ success: true, message: "Offboarding terminé" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// Placeholders pour les routes admin pour éviter les crashs
exports.getAdminStats = async (req, res) => {
  try {
    // 1. Compter le total des employés actifs ou en onboarding
    const totalEmployees = await Employee.countDocuments({
      status: { $in: ['active', 'onboarding'] },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 2. Compter les employés en congé AUJOURD'HUI
    const onLeaveToday = await LeaveRequest.countDocuments({
      status: 'approved',
      start_date: { $lte: tomorrow },
      end_date: { $gte: today }
    });

    // 3. Calculer le cumul des jours de congé du mois en cours
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const monthlyLeaves = await LeaveRequest.aggregate([
      {
        $match: {
          status: 'approved',
          start_date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalDays: { $sum: '$days' }
        }
      }
    ]);

    // On renvoie les vrais chiffres au format attendu par Flutter
    return res.json({
      success: true,
      stats: {
        total_employees: totalEmployees,
        on_leave_today: onLeaveToday,
        monthly_leave_days: monthlyLeaves[0]?.totalDays || 0
      }
    });

  } catch (error) {
    console.error('❌ Erreur getAdminStats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
exports.getAllEmployees = async (req, res) => {
  const employees = await Employee.find();
  res.json({ success: true, employees });
};
exports.getRecentActions = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    // Récupérer les dernières actions de Hera (ou les dernières demandes de congés)
    const recentActions = await HeraAction.find()
      .sort({ created_at: -1 })
      .limit(limit)
      .populate('employee_id', 'name role') // Pour avoir le nom de l'employé
      .lean();

    // Formater pour Flutter
    const formattedActions = recentActions.map(action => ({
      _id: action._id,
      employee_name: action.employee_id?.name || 'Système',
      action_type: action.action_type,
      created_at: action.created_at,
      badge: action.triggered_by === 'hera_auto' ? 'IA' : 'ADMIN'
    }));

    return res.json({
      success: true,
      recent_actions: formattedActions
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
exports.getAllActions = (req, res) => res.json({ success: true, actions: [] });
exports.deleteAction = (req, res) => res.json({ success: true, message: "Supprimé" });
exports.sendEmailToEcho = (req, res) => res.json({ success: true, message: "Envoyé" });
exports.receiveEmailFromEcho = (req, res) => res.json({ success: true, message: "Reçu" });