const Employee = require('../models/Employee');
const LeaveRequest = require('../models/LeaveRequest');
const HeraAction = require('../models/HeraAction');
const User = require('../models/User');
const mailService = require('../utils/emailService'); // Chemin corrigé selon ton projet
const heraAgent = require('../services/hera.agent'); // Ton service LangChain
const JobOffer = require('../models/JobOffer');
const Candidate = require('../models/Candidate');
const dexo = require('../controllers/dexoController'); // ✅ AJOUTE CECI
const mongoose = require('mongoose'); // ✅ AJOUTE CETTE LIGNE TOUT EN HAUT
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
// ── FONCTION : CHECK STAFFING (Alerte Echo) ──
exports.checkStaffingNeeds = async (req, res) => {
  try {
    const report = [];
    const departments = Object.keys(DEPARTMENT_LIMITS);
    const InboxEmail = require('../models/InboxEmail'); // On a besoin de vérifier les réponses d'Echo

    for (const dept of departments) {
      const count = await Employee.countDocuments({ department: dept, status: 'active' });
      const limit = DEPARTMENT_LIMITS[dept].max_employees;

      // 1. Détecter si le département est en sous-effectif (< 80%)
      if (count < limit * 0.8) {
        
        // 2. Chercher la TOUTE DERNIÈRE alerte envoyée pour ce département
        const lastAlert = await HeraAction.findOne({
          action_type: 'absence_alert',
          'details.department': dept
        }).sort({ created_at: -1 });

        let shouldNotify = false;
        let statusReason = "";

        if (!lastAlert) {
          // CAS 1 : Jamais d'alerte envoyée -> On envoie la première
          shouldNotify = true;
          statusReason = "Première alerte";
        } else {
          // CAS 2 : Une alerte existe, on vérifie si Echo a répondu "OK" (ou autre)
          // On cherche un mail d'Echo vers Hera arrivé APRÈS la dernière alerte
          const echoResponse = await InboxEmail.findOne({
            sender: "echo@e-team.com",
            to: "hera@e-team.com",
            receivedAt: { $gt: lastAlert.created_at }
          });

          if (echoResponse) {
            // Echo a répondu ! On s'arrête là, le recrutement est en cours.
            shouldNotify = false;
            statusReason = "Echo a déjà répondu (Recrutement en cours)";
          } else {
            // Echo n'a pas répondu. A-t-on dépassé les 7 jours ?
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            if (lastAlert.created_at < sevenDaysAgo) {
              // Plus de 7 jours sans réponse -> Relance hebdomadaire
              shouldNotify = true;
              statusReason = "Relance hebdomadaire (Pas de réponse d'Echo)";
            } else {
              // Moins de 7 jours, on attend encore
              shouldNotify = false;
              statusReason = "En attente de réponse d'Echo (Relance dans moins de 7j)";
            }
          }
        }

        // 3. Exécution de l'envoi si nécessaire
        if (shouldNotify) {
          console.log(`\n📢 [HÉRA] Sous-effectif détecté dans ${dept} (${statusReason})`);
          console.log(`   ${count}/${limit} postes occupés — ${limit - count} manquants`);

          // ÉTAPE A : Héra envoie un email à Echo (notification + instruction LinkedIn)
          await mailService.sendStaffingAlert(process.env.ECHO_EMAIL || 'echo-agent@e-team.com', {
            department: dept,
            count: count,
            max: limit,
            message: `Alerte Staffing : Le département ${dept} a besoin de renforts.`
          });
          console.log(`📧 [HÉRA→ECHO] Email d'alerte envoyé pour ${dept}`);

          // ÉTAPE B : Héra appelle directement Echo pour publier sur LinkedIn (sans attendre le mail)
          try {
            const echoBaseUrl = process.env.ECHO_API_URL || 'http://localhost:3000/api/echo';
            const echoResponse = await fetch(`${echoBaseUrl}/receive-staffing-alert`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                department: dept,
                currentCount: count,
                maxCapacity: limit,
                shortage: limit - count,
                postedBy: 'hera@e-team.com',
              })
            });
            const echoResult = await echoResponse.json();
            if (echoResult.success) {
              console.log(`💼 [HÉRA] Echo a publié l'offre LinkedIn pour ${dept} ✅`);
            } else {
              console.warn(`⚠️ [HÉRA] Echo n'a pas pu publier sur LinkedIn :`, echoResult.message || echoResult.error);
            }
          } catch (echoErr) {
            console.warn(`⚠️ [HÉRA] Appel Echo échoué (LinkedIn non publié) :`, echoErr.message);
          }

          // ÉTAPE C : On enregistre l'action Héra
          await HeraAction.create({
            action_type: 'absence_alert',
            details: { department: dept, count, limit, note: statusReason },
            triggered_by: 'hera_auto'
          });

          report.push({ dept, status: 'Alerte envoyée + LinkedIn déclenché', reason: statusReason });
        } else {
          report.push({ dept, status: 'Pas de mail', reason: statusReason });
        }
      }
    }
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// --- Garde ta fonction getNextSessionDate() que nous avons écrite avant ---

exports.processCandidacy = async (req, res) => {
  try {
    const { name, email, resume_text } = req.body;

    const analysis = await heraAgent.analyzeCandidate(resume_text, "Futur talent E-Team");
    const score = analysis.score || 0;

    let status = 'applied';
    let meeting_link = null;
    let interview_date = null;

    if (score > 70) {
      status = 'interview_scheduled';
      meeting_link = `https://meet.jit.si/ETeam_Discovery_Session_${Math.floor(Math.random()*1000)}`;
      
      // On calcule la date du prochain vendredi à 14h
      const dateObj = getNextSessionDate();
      const formattedDate = dateObj.toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      // ✅ ON ENVOIE L'INVITATION PROFESSIONNELLE
      await mailService.sendCandidacyInvitation(email, {
        name,
        meeting_link,
        interview_date: formattedDate // On passe la date ici
      });
    } else {
      await mailService.sendCandidacyConfirmation(email, name);
    }

    // Sauvegarde MongoDB
    await Candidate.create({
      name, email, status, score_ia: score, 
      meeting_link, interview_date: getNextSessionDate(), resume_text
    });

    res.json({ success: true, message: "Demande traitée avec succès" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// ── 2. GÉNÉRATION DE DOCUMENTS (CONTRAT / ATTESTATION) ────────────────────
exports.generateDocument = async (req, res) => {
  try {
    const { employee_id, doc_type } = req.body;
    
    // 1. On récupère l'employé avec toutes ses infos de contrat
    const employee = await Employee.findById(employee_id);
    if (!employee) return res.status(404).json({ message: "Employé non trouvé" });

    // 2. Préparation et formatage des dates (très important)
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    
    // Date d'aujourd'hui (date de signature)
    const today = new Date().toLocaleDateString('fr-FR', options);
    
    // Date de début (récupérée de l'onboarding)
    const startDate = employee.contract?.start 
      ? new Date(employee.contract.start).toLocaleDateString('fr-FR', options) 
      : "Non définie";

    // Date de fin (si CDD/Stage) ou mention CDI
    const endDate = employee.contract?.end 
      ? new Date(employee.contract.end).toLocaleDateString('fr-FR', options) 
      : "Indéterminée (Contrat CDI)";

    let content = "";

    if (doc_type === 'contract') {
      content = `
==========================================
           CONTRAT DE TRAVAIL
==========================================

RÉFÉRENCE : ET-2026-${employee_id.toString().substring(0, 5).toUpperCase()}
FAIT LE : ${today}

ENTRE :
La société E-TEAM, représentée par l'IA HERA.

ET LE COLLABORATEUR :
Nom : ${employee.name}
Poste : ${employee.role}
Département : ${employee.department}

------------------------------------------
DÉTAILS DU CONTRAT :
------------------------------------------
TYPE DE CONTRAT  : ${employee.contract?.type || 'CDI'}
DATE DE DÉBUT    : ${startDate}  <-- ✅
DATE DE FIN      : ${endDate}    <-- ✅
RÉMUNÉRATION     : ${employee.salary || 3000} € / mois

CLAUSES :
Ce document certifie que le collaborateur a passé
avec succès les étapes de recrutement IA. 
Le présent contrat est régi par les lois en vigueur.

------------------------------------------
SIGNATURE ÉLECTRONIQUE HERA IA : [CERTIFIÉ]
==========================================
      `;
    }

    // 3. On enregistre le document avec les VRAIES dates dans l'historique
    await HeraAction.create({
      employee_id: employee._id,
      action_type: 'contract_renewal',
      details: { 
        doc_type: 'contract', 
        content: content // On stocke le texte complet avec les dates
      },
      triggered_by: 'hera_auto'
    });

    res.json({ success: true, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.initAllMissingDocs = async (req, res) => {
  try {
    const employees = await Employee.find();
    let count = 0;

    for (const emp of employees) {
      // On vérifie si l'employé a déjà un contrat
      const hasContract = await HeraAction.findOne({ employee_id: emp._id, action_type: 'contract_renewal' });
      
      if (!hasContract) {
        // On lui crée son contrat rétroactivement
        const content = `CONTRAT DE TRAVAIL (Archive)\n\nEmployé : ${emp.name}\nPoste : ${emp.role}\nFait automatiquement par Hera.`;
        
        await HeraAction.create({
          employee_id: emp._id,
          action_type: 'contract_renewal',
          details: { doc_type: 'contract', content: content },
          triggered_by: 'hera_auto'
        });
        count++;
      }
    }
    res.json({ success: true, message: `${count} contrats générés pour les anciens employés.` });
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

  const employee = await Employee.findById(employee_id);
  if (!employee) return { success: false, message: "Employé non trouvé." };

  const remaining = (employee.leave_balance?.[type] || 0) - (employee.leave_balance_used?.[type] || 0);

  if (days > remaining) {
    const refusal_reason = `Solde insuffisant (${remaining}j restants).`;
    // ✅ Utilise la notification de CONGÉ (Refus)
    await mailService.sendLeaveNotification(employee.email, {
      employee_name: employee.name, start_date, end_date, status: 'refused', reason_decision: refusal_reason, days
    });
    return { success: false, message: refusal_reason };
  }

  const simultaneousCount = await LeaveRequest.countDocuments({
    status: 'approved',
    employee_id: { $ne: employee_id },
    $or: [{ start_date: { $lte: end }, end_date: { $gte: start } }]
  });

  let status = (type === 'urgent' || simultaneousCount < 2) ? 'approved' : 'refused';
  let decision_reason = status === 'approved' ? 'Capacité OK' : `Déjà ${simultaneousCount} personnes en congé.`;

  const leave = await LeaveRequest.create({
    employee_id, employee_email: employee.email, type, start_date: start, end_date: end, days, reason, status
  });

  await HeraAction.create({
    employee_id, action_type: status === 'approved' ? 'leave_approved' : 'leave_refused',
    details: { type, days, decision_reason }, triggered_by: 'hera_auto'
  });

  if (status === 'approved') {
    await Employee.findByIdAndUpdate(employee_id, { $inc: { [`leave_balance_used.${type}`]: days } });
  }

  // ✅ Utilise la notification de CONGÉ (Final)
  await mailService.sendLeaveNotification(employee.email, {
    employee_name: employee.name, start_date, end_date, status, reason_decision: decision_reason, days
  });

  return { success: true, status, message: `Décision : ${status}. ${decision_reason}`, leave };
}
// --- Helper pour calculer le prochain vendredi à 14h ---
// --- Helper pour calculer le prochain vendredi à 14h ---
function getNextSessionDate() {
  const now = new Date();
  const nextFriday = new Date();
  nextFriday.setDate(now.getDate() + (5 - now.getDay() + 7) % 7);
  nextFriday.setHours(14, 0, 0, 0);
  if (now > nextFriday) nextFriday.setDate(nextFriday.getDate() + 7);
  return nextFriday;
}
// ── FONCTION : CANDIDATURE (ATS) - VERSION UNIQUE ET NETTOYÉE ──
exports.processCandidacy = async (req, res) => {
  console.log("📩 [1/4] Nouvelle candidature reçue pour :", req.body.name);

  try {
    const { name, email, resume_text, job_offer_id } = req.body;

    // 1. Analyse IA
    console.log("🧠 [2/4] Hera analyse le CV via Groq...");
    const analysis = await heraAgent.analyzeCandidate(resume_text || "Aucun CV fourni", "Profil recherché");
    const score = analysis.score || 0;
    console.log(`📊 Score attribué par Hera : ${score}%`);

    let status = 'applied';
    let meeting_link = null;
    let interview_date = null;

    if (score > 70) {
      console.log("✨ Score élevé (>70), génération d'un lien de réunion...");
      status = 'interview_scheduled';
      meeting_link = `https://meet.jit.si/ETeam_Session_${new Date().getTime()}`;
      interview_date = getNextSessionDate();

      const formattedDate = interview_date.toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
      });

      // ENVOI DU MAIL INVITATION
      console.log("📧 Tentative d'envoi du mail d'invitation à :", email);
      await mailService.sendCandidacyInvitation(email, {
        name,
        score,
        meeting_link,
        interview_date: formattedDate
      });
    } else {
      console.log("ℹ️ Score insuffisant pour entretien immédiat. Envoi confirmation simple.");
      await mailService.sendCandidacyConfirmation(email, name);
    }

    // 2. Gestion de l'ID Offre (Optionnel)
    let validJobId = null;
    if (job_offer_id && mongoose.Types.ObjectId.isValid(job_offer_id)) {
      validJobId = job_offer_id;
    }

    // 3. Sauvegarde
    console.log("💾 [3/4] Enregistrement dans MongoDB...");
    const candidate = await Candidate.create({
      name, email, status, score_ia: score, 
      meeting_link, interview_date, resume_text,
      job_offer_id: validJobId
    });

    console.log("✅ [4/4] Processus terminé avec succès pour", name);
    res.json({ success: true, score_ia: score, candidate });

  } catch (err) {
    console.error("❌ ERREUR DANS processCandidacy :", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

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

// ── FONCTION : ONBOARDING (Vraie Bienvenue) ──
exports.onboarding = async (req, res) => {
  try {
    // 1. Création de l'employé en base
    const employee = await Employee.create(req.body);

    // 2. 📝 GÉNÉRATION DU CONTRAT PAR HERA
    const dateStr = new Date().toLocaleDateString('fr-FR');
    const contractText = `
      CONTRAT DE TRAVAIL - E-TEAM
      ------------------------------------
      RÉFÉRENCE : ET-${Math.floor(Math.random() * 10000)}
      DATE D'ÉMISSION : ${dateStr}
      
      ENTRE : La société E-Team, représentée par l'agent IA Hera.
      ET : M./Mme ${employee.name}.
      
      Il est convenu ce qui suit :
      POSTE : ${employee.role}
      DÉPARTEMENT : ${employee.department}
      TYPE DE CONTRAT : ${employee.contract?.type || 'CDI'}
      
      Hera IA certifie que ce document est généré automatiquement
      et fait foi de l'intégration du collaborateur dans le système.
    `;

    // 3. ✅ ENREGISTREMENT DANS HERA ACTION (Pour que Flutter le voie)
    // On utilise 'contract_renewal' car c'est ce que ton Front cherche
    await HeraAction.create({
      employee_id: employee._id,
      action_type: 'contract_renewal', 
      details: { 
        doc_type: 'contract',
        content: contractText // C'est ce texte qui sera affiché dans la pop-up
      },
      triggered_by: 'hera_auto'
    });

    // 4. Envoi du mail de bienvenue
    await mailService.sendWelcomeEmail(employee.email, employee.name);

    res.status(201).json({ 
      success: true, 
      message: "Onboarding réussi et contrat généré",
      employee_id: employee._id 
    });

  } catch (err) {
    console.error("Erreur Onboarding:", err);
    res.status(500).json({ error: err.message });
  }
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
    const limit = parseInt(req.query.limit) || 8;

    const recentActions = await HeraAction.find()
      .sort({ created_at: -1 })
      .limit(limit)
      .populate('employee_id', 'name role')
      .lean();

    const formattedActions = recentActions.map(action => ({
      _id: action._id,
      employee_name: action.employee_id?.name || 'Système',
      action_type: action.action_type,
      // ✅ AJOUTE CETTE LIGNE POUR ENVOYER LES DÉTAILS À FLUTTER
      details: action.details, 
      created_at: action.created_at,
      badge: action.triggered_by === 'hera_auto' ? 'IA' : 'ADMIN'
    }));

    return res.json({ success: true, recent_actions: formattedActions });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
exports.getAllActions = (req, res) => res.json({ success: true, actions: [] });
exports.deleteAction = (req, res) => res.json({ success: true, message: "Supprimé" });

// ── Endpoint reçu par Héra quand Echo répond ──
exports.receiveEmailFromEcho = async (req, res) => {
  try {
    const { subject, sender, content, type } = req.body;
    console.log(`📬 [HÉRA] Message reçu d'Echo — Sujet: ${subject}`);

    // Sauvegarder la réponse d'Echo dans HeraAction pour éviter les relances
    await HeraAction.create({
      action_type: 'echo_response',
      details: { subject, sender, content, type },
      triggered_by: 'echo_agent'
    });

    res.json({ success: true, message: 'Message d\'Echo enregistré par Héra' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Héra envoie un message à Echo (endpoint manuel) ──
exports.sendEmailToEcho = async (req, res) => {
  try {
    const { department, currentCount, maxCapacity, shortage } = req.body;
    
    if (!department) {
      return res.status(400).json({ success: false, error: "'department' requis" });
    }

    const limit = maxCapacity || DEPARTMENT_LIMITS[department]?.max_employees || 10;
    const count = currentCount || 0;

    // Envoyer le mail
    await mailService.sendStaffingAlert(process.env.ECHO_EMAIL || 'echo-agent@e-team.com', {
      department, count, max: limit,
      message: `Alerte manuelle Staffing : Le département ${department} a besoin de renforts.`
    });

    // Déclencher Echo immédiatement
    const echoBaseUrl = process.env.ECHO_API_URL || 'http://localhost:3000/api/echo';
    const echoRes = await fetch(`${echoBaseUrl}/receive-staffing-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department, currentCount: count, maxCapacity: limit, shortage: shortage || (limit - count), postedBy: 'hera@e-team.com' })
    });
    const echoResult = await echoRes.json();

    res.json({ success: true, message: `Email envoyé à Echo + LinkedIn déclenché`, echoResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};