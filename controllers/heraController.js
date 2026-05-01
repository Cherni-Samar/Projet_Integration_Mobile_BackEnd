const Employee = require('../models/Employee');
const LeaveRequest = require('../models/LeaveRequest');
const HeraAction = require('../models/HeraAction');
const User = require('../models/User');
const mailService = require('../utils/emailService'); // Chemin corrigé selon ton projet
const heraAgent = require('../services/hera.agent'); // Ton service LangChain
const JobOffer = require('../models/JobOffer');
const Candidate = require('../models/Candidate');
const dexo = require('../controllers/dexoController');
const InboxEmail = require('../models/InboxEmail'); // ✅ AJOUTE CETTE LIGNE// ✅ AJOUTE CECI
const mongoose = require('mongoose');
const timo = require('./timoController');           // ✅ OBLIGATOIRE pour l'appel autonome
const bcrypt = require('bcryptjs');
const Document = require('../models/Document'); // ✅ AJOUTE CET IMPORT
// ✅ Assure-toi d'avoir installé : npm install bcryptjs
// ✅ AJOUTE CETTE LIGNE TOUT EN HAUT
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
exports.getAllCandidates = async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ score_ia: -1 });
    res.json({ success: true, candidates });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── FONCTION : CHECK STAFFING (Alerte Echo) ──
exports.checkStaffingNeeds = async (req, res) => {
  try {
    const report = [];
    const departments = Object.keys(DEPARTMENT_LIMITS);
    const InboxEmail = require('../models/InboxEmail');
    const EmailReply = require('../models/EmailReply');
    const Candidate = require('../models/Candidate'); // Pour vérifier les nouveaux candidats

    // Date de référence : il y a 7 jours
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const dept of departments) {
      const count = await Employee.countDocuments({ department: dept, status: 'active' });
      const limit = DEPARTMENT_LIMITS[dept].max_employees;

      // CONDITION 1 : Sous-effectif détecté (< 80%)
      if (count < limit * 0.8) {

        // CONDITION 2 : Existe-t-il une alerte envoyée DURANT LES 7 DERNIERS JOURS ?
        const recentAlert = await HeraAction.findOne({
          action_type: 'absence_alert',
          'details.department': dept,
          created_at: { $gt: sevenDaysAgo } // Plus récent que 7 jours
        }).sort({ created_at: -1 });

        if (recentAlert) {
          report.push({
            dept,
            status: 'WAITING',
            reason: "Une alerte a déjà été envoyée cette semaine. On attend les résultats."
          });
          continue; // On passe au département suivant sans rien envoyer
        }

        // CONDITION 3 : Si une vieille alerte existe, on vérifie si Echo a répondu 
        // ET si des candidats ont postulé entre-temps
        const lastAlertEver = await HeraAction.findOne({
          action_type: 'absence_alert',
          'details.department': dept
        }).sort({ created_at: -1 });

        if (lastAlertEver) {
          // A-t-on reçu des candidats pour ce département depuis la dernière alerte ?
          const newCandidates = await Candidate.countDocuments({
            department: dept,
            created_at: { $gt: lastAlertEver.created_at }
          });

          if (newCandidates > 0) {
            report.push({
              dept,
              status: 'OK',
              reason: `${newCandidates} nouveaux candidats ont postulé. Recrutement efficace, pas de relance.`
            });
            continue;
          }

          // Echo a-t-il déjà répondu par un mail de confirmation ?
          const echoResponse = await InboxEmail.findOne({
            sender: "echo@e-team.com",
            to: "hera@e-team.com",
            receivedAt: { $gt: lastAlertEver.created_at }
          });

          if (echoResponse) {
            // Echo a répondu mais pas de candidats après 7 jours ? 
            // Là on pourrait relancer, mais selon ta règle on attend encore.
            report.push({ dept, status: 'WAITING', reason: "Echo a publié, on attend que les candidats remplissent le formulaire." });
            continue;
          }
        }

        // SI ON ARRIVE ICI : Soit c'est la 1ère fois, soit ça fait + de 7 jours sans résultats
        console.log(`📢 [HERA] Alerte Staffing hebdomadaire pour : ${dept}`);

        // ⚡ CONSUME ENERGY FOR STAFFING ALERT
        const { manualEnergyConsumption } = require('../middleware/energyMiddleware');

        // Find user with most energy for energy deduction
        let userId = null;
        let energyConsumed = 0;
        try {
          const User = require('../models/User');
          const userWithEnergy = await User.findOne({ energyBalance: { $gt: 0 } }).sort({ energyBalance: -1 });
          if (userWithEnergy) {
            userId = userWithEnergy._id.toString();
            console.log(`⚡ [HERA] Using user portfolio for energy: ${userId} (${userWithEnergy.energyBalance} energy)`);
          }

          const energyResult = await manualEnergyConsumption(
            'hera',
            'STAFFING_ALERT',
            `Processed staffing alert for ${dept} department`,
            {
              department: dept,
              currentCount: count,
              maxCapacity: limit
            },
            userId // Pass userId for user portfolio deduction
          );

          if (energyResult.success) {
            energyConsumed = energyResult.energyCost;
            console.log(`⚡ [ENERGY] Hera consumed ${energyResult.energyCost} energy for STAFFING_ALERT`);
          } else {
            console.warn(`⚠️ [ENERGY] ${energyResult.error} - Continuing with staffing alert`);
          }
        } catch (err) {
          console.warn('⚠️ [HERA] Could not process energy consumption:', err.message);
        }

        // 1. Création du mail technique pour Echo
        const newAlertMail = await InboxEmail.create({
          sender: "hera@e-team.com",
          to: "echo@e-team.com",
          subject: `[STAFFING WEEKLY] Besoin renfort : ${dept}`,
          content: `Alerte hebdomadaire : Le département ${dept} est à ${count}/${limit}.`,
          category: 'recrutement',
          priority: 'high'
        });

        // 2. Appel API Echo
        try {
          await fetch('http://localhost:3000/api/echo/receive-staffing-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              emailId: newAlertMail._id,
              department: dept,
              currentCount: count,
              maxCapacity: limit
            })
          });
        } catch (e) { console.warn("Echo inaccessible"); }

        // 3. Log de l'action dans HeraAction (C'est ce log qui bloque les alertes pendant 7 jours)
        await HeraAction.create({
          action_type: 'absence_alert',
          details: {
            department: dept,
            email_id: newAlertMail._id,
            count: count,
            limit: limit,
            energyConsumed: energyConsumed
          },
          triggered_by: 'hera_auto'
        });

        report.push({ dept, status: 'SENT', reason: "Alerte hebdomadaire envoyée à Echo." });

      } else {
        report.push({ dept, status: 'OK', reason: "Effectif suffisant." });
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
    const { name, email, resume_text, department } = req.body;
    // ✅ On récupère le fichier envoyé
    const resume_url = req.file ? req.file.path : null;

    // Logic IA (Inchangée)
    const analysis = await heraAgent.analyzeCandidate(resume_text, department);
    const score = Number(analysis.score) || 0;
    if (score > 80) {
      // ✅ REMPLACE PAR CE NOM (Étape 1 : Entretien individuel)
      await mailService.sendInterviewInvitation(email, name);
      await Candidate.create({
        name,
        email,
        department,
        resume_text,
        resume_url, // 👈 Le chemin vers le PDF est stocké ici
        status: score >= 80 ? 'interview_scheduled' : 'applied',
        score_ia: score
      });
    } else {
      await mailService.sendCandidacyConfirmation(email, name);
      await Candidate.create({ name, email, status: 'applied', score_ia: score, resume_text });
    }
    res.json({ success: true, score });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.hireCandidate = async (req, res) => {
  try {
    const candidateId = req.params.id;
    const candidate = await Candidate.findById(candidateId);

    if (!candidate) return res.status(404).json({ message: "Candidat non trouvé" });

    // 1. Création du profil Employé
    const newEmployee = await Employee.create({
      name: candidate.name,
      email: candidate.email,
      status: 'active',
      role: "Collaborateur",
      department: candidate.department || "Tech",
      leave_balance: { annual: 25, sick: 10, urgent: 3 }
    });

    // --- 🤖 LOGIQUE ANTI-DOUBLON DE TIMO (Utilise ton modèle 'Task') ---
    let suggestedDate = new Date();
    // On commence les RDV à partir de demain à 14:00
    suggestedDate.setDate(suggestedDate.getDate() + 1);
    suggestedDate.setHours(14, 0, 0, 0);

    let isSlotOccupied = true;

    while (isSlotOccupied) {
      // On vérifie si une tâche de type 'meeting' existe déjà à cette 'deadline'
      const conflict = await Task.findOne({
        deadline: suggestedDate,
        category: 'meeting'
      });

      if (conflict) {
        // Si occupé, on décale de 1 heure
        console.log(`⚠️ Slot ${suggestedDate.toLocaleString()} occupé par "${conflict.title}", décalage...`);
        suggestedDate.setHours(suggestedDate.getHours() + 1);

        // Si on dépasse 17h, on passe au lendemain 14h
        if (suggestedDate.getHours() >= 17) {
          suggestedDate.setDate(suggestedDate.getDate() + 1);
          suggestedDate.setHours(14, 0, 0, 0);
        }
      } else {
        // Le créneau est libre !
        isSlotOccupied = false;
      }
    }

    // 2. Création de la tâche pour Timo (Blocage du calendrier)
    await Task.create({
      title: `Onboarding : ${newEmployee.name}`,
      description: `Session d'intégration officielle pour le nouveau collaborateur ${newEmployee.name}.`,
      deadline: suggestedDate, // ✅ Utilise ton champ 'deadline'
      category: 'meeting',
      priority: 'high',
      status: 'todo',
      userId: 'current_user' // Valeur par défaut de ton modèle
    });

    // 3. ✅ Envoi de la notification mail par Hera
    const formattedDate = suggestedDate.toLocaleString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });

    await mailService.sendGroupMeetingInvitation(candidate.email, {
      name: candidate.name,
      interview_date: formattedDate,
      meeting_link: "https://meet.jit.si/ETeam_Discovery_Session"
    });

    // 4. On retire le candidat de la liste
    await Candidate.findByIdAndDelete(candidateId);

    res.json({
      success: true,
      message: "Embauche réussie. Timo a planifié le RDV.",
      plannedDate: formattedDate
    });

  } catch (err) {
    console.error("❌ Erreur hireCandidate:", err);
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
    // Dans controllers/heraController.js
    // Dans controllers/heraController.js

    if (doc_type === 'contract') {
      content = `
==========================================
           CONTRAT DE TRAVAIL
==========================================

RÉFÉRENCE : ET-2026-${employee_id.toString().substring(0, 5).toUpperCase()}
FAIT LE : ${today}

ENTRE :
La société E-TEAM, 

ET LE COLLABORATEUR :
Nom : ${employee.name}
Poste : ${employee.role}
Département : ${employee.department}

------------------------------------------
DÉTAILS DU CONTRAT :
------------------------------------------
TYPE DE CONTRAT  : ${employee.contract?.type || 'CDI'}
DATE DE DÉBUT    : ${startDate}
DATE DE FIN      : ${endDate}
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
// ── HELPER : CALCUL DU PROCHAIN VENDREDI 14H ──
function getNextSessionDate() {
  const now = new Date();
  const nextFriday = new Date();
  // Calcule le nombre de jours jusqu'au vendredi (5)
  nextFriday.setDate(now.getDate() + (5 - now.getDay() + 7) % 7);
  nextFriday.setHours(14, 0, 0, 0);

  // Si on est déjà vendredi après 14h, on passe au vendredi suivant
  if (now > nextFriday) {
    nextFriday.setDate(nextFriday.getDate() + 7);
  }
  return nextFriday;
}

exports.processCandidacy = async (req, res) => {
  try {
    const { name, email, resume_text, department, job_offer_id } = req.body;
    const resume_url = req.file ? req.file.path : null;

    console.log(`📩 [HERA] Candidature reçue : ${name} — ${email} — Dept: ${department || 'N/A'}`);

    // ── Validation ──
    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Les champs name et email sont requis.' });
    }

    const analysis = await heraAgent.analyzeCandidate(resume_text || '', department || 'Profil E-Team');
    const score = Number(analysis.score) || 0;
    console.log(`📊 [HERA] Score IA pour ${name} : ${score}`);

    // ── EMAIL 1 : Confirmation de réception (TOUJOURS envoyé) ──
    await mailService.sendCandidacyConfirmation(email, name);
    console.log(`📧 [HERA] Email 1 — Confirmation envoyée à ${email}`);

    if (score >= 80) {
      // ✅ LIEN INDIVIDUEL UNIQUE
      const individualMeet = `https://meet.jit.si/ETeam_Interview_${name.replace(/\s+/g, '_')}`;
      const date = await timo.autoPlanMeeting(name, "Interview");

      await mailService.sendCandidacyInvitation(email, {
        name,
        score,
        interview_date: date?.date || 'À confirmer',
        meeting_link: individualMeet
      });
      await Candidate.create({ name, email, status: 'interview_scheduled', score_ia: score, resume_text, meeting_link: individualMeet });
    } else {
      // Score < 80 : pas d'invitation, juste la confirmation (déjà envoyée)
      await Candidate.create({ name, email, department, resume_text, resume_url, status: 'applied', score_ia: score });
      console.log(`📧 [HERA] Score ${score} < 80 — Pas d'invitation`);
    }

    res.json({ success: true, score });
  } catch (err) {
    console.error('❌ [HERA] Erreur processCandidacy:', err.message);
    res.status(500).json({ error: err.message });
  }
};


// ── ÉTAPE 2 : EMBOUCHE ET SESSION COLLECTIVE (Après validation Admin) ──
exports.hireCandidate = async (req, res) => {
  try {
    const candidateId = req.params.id;
    const candidate = await Candidate.findById(candidateId);

    if (!candidate) return res.status(404).json({ message: "Candidat non trouvé" });

    // 1. On crée le profil Employé officiellement
    const newEmployee = await Employee.create({
      name: candidate.name,
      email: candidate.email,
      status: 'active',
      role: "Collaborateur", // À modifier dynamiquement si besoin
      leave_balance: { annual: 25, sick: 10, urgent: 3 }
    });

    // 2. On prépare la date de la session de bienvenue (Vendredi 14h)
    const sessionDate = getNextSessionDate();
    const formattedDate = sessionDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
    const date = await timo.autoPlanMeeting(newEmployee.name, "Onboarding");

    // 3. ✅ CAS C : Embauche validée -> On invite au MEET COLLECTIF D'ÉQUIPE (Noir & Lime)
    // Utilise la fonction : sendGroupMeetingInvitation
    await mailService.sendGroupMeetingInvitation(candidate.email, {
      name: candidate.name,
      interview_date: formattedDate,
      meeting_link: "https://meet.jit.si/ETeam_Discovery_Session_Team"
    });

    // 4. On retire le candidat de la liste de recrutement
    await Candidate.findByIdAndDelete(candidateId);

    console.log(`✅ ${candidate.name} est embauché. Mail de bienvenue envoyé.`);
    res.json({ success: true, message: "Embauche réussie et mail d'équipe envoyé." });

  } catch (err) {
    console.error("❌ Erreur hireCandidate:", err);
    res.status(500).json({ error: err.message });
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
    const { name, email, password } = req.body;
    // On génère un mot de passe s'il n'y en a pas
    const tempPassword = req.body.password || `ET-${Math.floor(1000 + Math.random() * 9000)}`;

    // ✅ ÉTAPE CRUCIALE : Hachage
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    // Création de l'employé avec le mot de passe HACHÉ
    const employee = await Employee.create({
      ...req.body,
      password: hashedPassword, // 👈 On enregistre la version cryptée
      status: 'active'
    });

    // Envoi du mail avec le mot de passe en CLAIR (pour que l'utilisateur le connaisse)
    await mailService.sendWelcomeEmail(employee.email, employee.name, tempPassword);

    res.status(201).json({ success: true, message: "Onboarding réussi" });
  } catch (err) {
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
  try {
    // ✅ On ignore les 'inactive' pour ne pas polluer l'écran
    const employees = await Employee.find({
      status: { $in: ['active', 'onboarding', 'offboarding'] }
    }).sort({ name: 1 });

    res.json({ success: true, employees });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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
// ── NOUVELLE FONCTION : TRAITER LA DÉMISSION (OFF-BOARDING) ──
exports.processResignation = async (req, res) => {
  try {
    const { email } = req.body;
    const employee = await Employee.findOne({ email: email.toLowerCase().trim() });

    if (!employee) return res.status(404).json({ success: false, message: "Employé non trouvé" });

    // ⚡ CONSUME ENERGY FOR EMPLOYEE ANALYSIS (resignation processing)
    const { manualEnergyConsumption } = require('../middleware/energyMiddleware');

    // Find user with most energy for energy deduction
    let userId = null;
    let energyConsumed = 0;
    try {
      const User = require('../models/User');
      const userWithEnergy = await User.findOne({ energyBalance: { $gt: 0 } }).sort({ energyBalance: -1 });
      if (userWithEnergy) {
        userId = userWithEnergy._id.toString();
        console.log(`⚡ [HERA] Using user portfolio for energy: ${userId} (${userWithEnergy.energyBalance} energy)`);
      }

      const energyResult = await manualEnergyConsumption(
        'hera',
        'EMPLOYEE_ANALYSIS',
        `Processed resignation for ${employee.name}`,
        {
          employeeId: employee._id,
          employeeName: employee.name,
          processType: 'resignation'
        },
        userId // Pass userId for user portfolio deduction
      );

      if (energyResult.success) {
        energyConsumed = energyResult.energyCost;
        console.log(`⚡ [ENERGY] Hera consumed ${energyResult.energyCost} energy for EMPLOYEE_ANALYSIS`);
      } else {
        console.warn(`⚠️ [ENERGY] ${energyResult.error} - Continuing with resignation processing`);
      }
    } catch (err) {
      console.warn('⚠️ [HERA] Could not process energy consumption:', err.message);
    }

    // ✅ APPEL À TIMO (Attendre l'objet de retour)
    const planning = await timo.autoPlanMeeting(employee.name, "Démission");

    await mailService.sendHeraConvocation(employee.email, {
      name: employee.name,
      date: planning.date,
      type: "Entretien de départ",
      mode: "Remote", // Ou "On-site"
      meeting_link: `https://meet.jit.si/ETeam_Exit_${employee.name.replace(/\s+/g, '_')}` // ✅ ICI ON CRÉE LE LIEN
    });

    res.json({ success: true, message: `Rendez-vous fixé au ${planning.date}` });

  } catch (err) {
    console.error("🔥 CRASH BACKEND:", err.message); // Regarde ton terminal Node !
    res.status(500).json({ error: err.message });
  }
};

// controllers/heraController.js

exports.getAgentInteractions = async (req, res) => {
  try {
    // 1. On récupère les 10 derniers logs bruts de la base de données
    const rawLogs = await HeraAction.find()
      .sort({ created_at: -1 })
      .limit(10)
      .populate('employee_id', 'name');

    // 2. On prépare un prompt pour que l'IA interprète ces logs
    const prompt = `
      Tu es Dexo, le Superviseur de l'écosystème E-Team. 
      Analyse ces logs système et transforme-les en un tableau JSON d'interactions entre agents.
      
      LOGS À ANALYSER :
      ${JSON.stringify(rawLogs)}

      RÈGLES STRICTES :
      - Tu dois identifier l'émetteur (sender) et le récepteur (receiver) parmi : hera, echo, timo, dexo, kash.
      - Pour une 'doc_request', le sender est 'dexo' et le receiver est 'hera'.
      - Pour une 'absence_alert', le sender est 'hera' et le receiver est 'echo'.
      - Pour une 'offboarding_started', le sender est 'hera' et le receiver est 'timo'.
      - 'summary' doit être une phrase technique et pro.
      - 'status' doit être 'success' ou 'encrypted'.

      FORMAT DE RÉPONSE (JSON UNIQUEMENT) :
      {
        "interactions": [
          { "id": "ID_DU_LOG", "sender": "nom", "receiver": "nom", "actionType": "type", "summary": "phrase", "timestamp": "ISO_DATE", "status": "success" }
        ]
      }
    `;

    // 3. Appel à l'IA pour interpréter les logs
    const aiResponse = await heraAgent.llm.invoke(prompt);

    // On nettoie la réponse pour être sûr d'avoir du JSON pur
    const cleanJson = aiResponse.content.match(/\{.*\}/s)[0];
    const parsedData = JSON.parse(cleanJson);

    res.json({ success: true, ...parsedData });

  } catch (err) {
    console.error("❌ Erreur IA Logs:", err.message);
    res.status(500).json({ success: false, error: "L'IA n'a pas pu interpréter les logs." });
  }
};
// controllers/heraController.js

exports.getAgentInteractionStats = async (req, res) => {
  try {
    // 1. On compte le total des interactions (logs HeraAction)
    const total = await HeraAction.countDocuments();

    // 2. On compte les échanges "Encrypted" (tous les doc_request qui ont un hash)
    const encrypted = await HeraAction.countDocuments({ action_type: 'doc_request' });

    // 3. On compte les succès (on considère les alertes staffing et offboarding comme succès immédiat)
    const successful = await HeraAction.countDocuments({
      action_type: { $in: ['absence_alert', 'offboarding_started'] }
    }) + encrypted;

    res.json({
      success: true,
      stats: {
        total: total,
        successful: successful,
        encrypted: encrypted,
        pending: 0,
        failed: 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
exports.getAllActions = (req, res) => res.json({ success: true, actions: [] });
exports.deleteAction = (req, res) => res.json({ success: true, message: "Supprimé" });
exports.sendEmailToEcho = (req, res) => res.json({ success: true, message: "Envoyé" });
exports.receiveEmailFromEcho = (req, res) => res.json({ success: true, message: "Reçu" });