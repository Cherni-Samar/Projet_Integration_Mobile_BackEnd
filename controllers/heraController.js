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

// ── FONCTION : CHECK STAFFING ──
exports.checkStaffingNeeds = async (req, res) => {
  try {
    const report = [];
    const departments = Object.keys(DEPARTMENT_LIMITS); // Récupère Tech, Design, etc.

    for (const dept of departments) {
      const count = await Employee.countDocuments({ department: dept, status: 'active' });
      const limit = DEPARTMENT_LIMITS[dept].max_employees;

      if (count < limit * 0.8) {
        const gap = limit - count;
        const newOffer = await JobOffer.create({
          title: `Expert ${dept}`,
          department: dept,
          description: `Besoin de ${gap} talents.`
        });

        await mailService.sendWelcomeEmail(
          "echo-agent@e-team.com", 
          `Hera : Alerte Recrutement ${dept}`, 
          `Besoin urgent en ${dept}. Offre créée : ${newOffer._id}`
        );
        report.push({ dept,offer_id: newOffer._id, count, limit, action: 'Offre créée & Mail Echo envoyé' });
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
exports.getAdminStats = (req, res) => res.json({ success: true, stats: {} });
exports.getAllEmployees = async (req, res) => {
  const employees = await Employee.find();
  res.json({ success: true, employees });
};
exports.getRecentActions = (req, res) => res.json({ success: true, recent_actions: [] });
exports.getAllActions = (req, res) => res.json({ success: true, actions: [] });
exports.deleteAction = (req, res) => res.json({ success: true, message: "Supprimé" });
exports.sendEmailToEcho = (req, res) => res.json({ success: true, message: "Envoyé" });
exports.receiveEmailFromEcho = (req, res) => res.json({ success: true, message: "Reçu" });