const Employee = require('../models/Employee');
const LeaveRequest = require('../models/LeaveRequest');
const HeraAction = require('../models/HeraAction');
const User = require('../models/User');
const mailService = require('../utils/emailService'); // Chemin corrigé selon ton projet
const heraAgent = require('../services/hera/hera.agent'); // Ton service LangChain
const JobOffer = require('../models/JobOffer');
const Candidate = require('../models/Candidate');
const dexo = require('../controllers/dexoController'); 
const InboxEmail = require('../models/InboxEmail'); // ✅ AJOUTE CETTE LIGNE// ✅ AJOUTE CECI
const mongoose = require('mongoose');
const timo = require('./timoController');           // ✅ OBLIGATOIRE pour l'appel autonome
const bcrypt = require('bcryptjs');
const Document = require('../models/Document'); // ✅ AJOUTE CET IMPORT
const employeeManagementService = require('../services/hera/employeeManagement.service');
const CentralizedEnergyService = require('../services/energy/centralizedEnergy.service');
const leaveRequestService = require('../services/hera/leaveRequest.service');
const recruitmentService = require('../services/hera/recruitment.service');

// ══════════════════════════════════════════════════════════════════════════
// HELPERS INTERNES
// ══════════════════════════════════════════════════════════════════════════

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
        const result = await leaveRequestService.processLeaveRequest({
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
    const result = await recruitmentService.getAllCandidates();
    res.json(result);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

// ── FONCTION : CHECK STAFFING (Alerte Echo) ──
exports.checkStaffingNeeds = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.workforceSettings) {
      return res.json({
        success: true,
        message: 'Aucune configuration workforce',
        gaps: [],
      });
    }

    const gaps = [];

    for (const dept of user.workforceSettings) {
      const current = await Employee.countDocuments({
        ceo_id: req.user.id,
        department: dept.department,
      });

      const missing = dept.targetCount - current;

      if (missing > 0) {
        gaps.push({
          department: dept.department,
          current,
          target: dept.targetCount,
          missing,
        });

        // 7-day deduplication: skip if an alert was already sent for this
        // department in the last 7 days to avoid spamming Echo
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentAlert = await HeraAction.findOne({
          ceo_id: req.user.id,
          action_type: 'absence_alert',
          'details.department': dept.department,
          created_at: { $gt: sevenDaysAgo },
        });

        if (recentAlert) {
          console.log(`⏭️ [HERA] Staffing alert for ${dept.department} skipped — sent within last 7 days`);
          continue;
        }

        // 🔥 créer action Hera
        await HeraAction.create({
          ceo_id: req.user.id,
          action_type: 'absence_alert',
          triggered_by: 'hera_auto',
          details: {
            department: dept.department,
            missing,
          },
        });
      }
    }

    res.json({
      success: true,
      gaps,
    });

  } catch (err) {
    console.error('❌ Staffing error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
// --- Garde ta fonction getNextSessionDate() que nous avons écrite avant ---



exports.hireCandidate = async (req, res) => {
  try {
    const result = await recruitmentService.hireCandidate(req.params.id);
    
    if (!result.success) {
      return res.status(result.statusCode || 500).json({ message: result.message });
    }
    
    res.json(result);
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
// EXPORTS POUR LES ROUTES
// ══════════════════════════════════════════════════════════════════════════
exports.processCandidacy = async (req, res) => {
  try {
    const { name, email, resume_text, department, job_offer_id } = req.body;
    const resume_url = req.file ? req.file.path : null;

    console.log(`📩 [HERA] Candidature reçue : ${name} — ${email} — Dept: ${department || 'N/A'}`);
    console.log(`📄 [HERA] Fichier PDF : ${req.file ? req.file.originalname : 'aucun'}`);
    console.log(`📝 [HERA] Texte CV : ${resume_text ? resume_text.substring(0, 50) + '...' : 'vide'}`);

    // ── Validation ──
    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Les champs name et email sont requis.' });
    }

    // ── Réponse immédiate au candidat (évite le timeout 60s sur Render) ──
    res.json({ success: true, score: null, message: 'Candidature reçue ! Vous recevrez un email sous quelques minutes.' });

    // ── Traitement en arrière-plan (après la réponse HTTP) ──
    setImmediate(async () => {
      try {
        // ── Extraction texte du PDF si fourni ──
        let finalResumeText = resume_text || '';
        if (req.file && req.file.path) {
          try {
            const fs = require('fs');
            const pdfParse = require('pdf-parse');
            const pdfBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdfParse(pdfBuffer);
            const pdfText = pdfData.text?.trim() || '';
            if (pdfText.length > 50) {
              finalResumeText = pdfText + '\n' + finalResumeText;
              console.log(`📄 [HERA] PDF extrait : ${pdfText.length} caractères`);
            }
          } catch (pdfErr) {
            console.warn(`⚠️ [HERA] Impossible de lire le PDF : ${pdfErr.message}`);
          }
        }

        console.log(`📝 [HERA] Texte final pour analyse (${finalResumeText.length} chars)`);

        const analysis = await recruitmentService.analyzeCandidate
          ? await recruitmentService.analyzeCandidate(finalResumeText || 'Candidat sans CV', department || 'Profil E-Team')
          : await (require('../services/hera/hera.agent')).analyzeCandidate(finalResumeText || 'Candidat sans CV', department || 'Profil E-Team');
        const score = Number(analysis.score) || 0;
        console.log(`📊 [HERA] Score IA pour ${name} : ${score}`);

        // ── EMAIL 1 : Confirmation de réception (TOUJOURS envoyé) ──
        const confirmSent = await mailService.sendCandidacyConfirmation(email, name);
        console.log(`📧 [HERA] Email 1 — Confirmation → ${email} : ${confirmSent ? '✅ ENVOYÉ' : '❌ ÉCHEC'}`);

        if (score >= 80) {
          // ── Génération du lien MODELAI/INTERVIEW ──
          const modelaiBaseUrl = process.env.INTERVIEW_URL || process.env.MODELAI_URL || 'http://localhost:3001';
          const interviewLink = `${modelaiBaseUrl}/index.html?name=${encodeURIComponent(name)}&department=${encodeURIComponent(department || 'General')}&role=${encodeURIComponent(req.body.job_role || 'Collaborateur')}&email=${encodeURIComponent(email)}&lang=fr`;

          console.log(`🔗 [HERA] Lien entretien généré : ${interviewLink}`);

          const date = await timo.autoPlanMeeting(name, "Interview");

          const inviteSent = await mailService.sendInterviewInvitation(email, {
            name,
            score,
            interview_date: date?.date || 'À confirmer',
            meeting_link: interviewLink
          });
          console.log(`📧 [HERA] Email 2 — Invitation entretien IA → ${email} : ${inviteSent ? '✅ ENVOYÉ' : '❌ ÉCHEC'}`);

          await Candidate.create({
            name,
            email,
            department,
            status: 'interview_scheduled',
            score_ia: score,
            resume_text: finalResumeText,
            meeting_link: interviewLink
          });
        } else {
          await Candidate.create({
            name,
            email,
            department,
            resume_text: finalResumeText,
            resume_url,
            status: 'applied',
            score_ia: score
          });
          console.log(`📧 [HERA] Score ${score} < 80 — Seul l'email de confirmation envoyé à ${email}`);
        }
      } catch (bgErr) {
        console.error('❌ [HERA] Erreur traitement arrière-plan:', bgErr.message);
      }
    });

  } catch (err) {
    console.error('❌ [HERA] Erreur processCandidacy:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
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

      const result = await leaveRequestService.processLeaveRequest({
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
    const result = await leaveRequestService.processLeaveRequest(req.body);
    res.status(result.success ? 201 : 400).json(result);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

exports.urgentLeave = async (req, res) => {
  try {
    const result = await leaveRequestService.processUrgentLeave(req.body);
    res.status(result.success ? 201 : 400).json(result);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

// ── FONCTION : ONBOARDING (Vraie Bienvenue) ──
exports.onboarding = async (req, res) => {
  try {
    const ceoId = req.user.id;

    const tempPassword =
      req.body.password || `ET-${Math.floor(1000 + Math.random() * 9000)}`;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    const employee = await Employee.create({
      ...req.body,
      email: normalizeEmail(req.body.email),
      ceo_id: ceoId,
      password: hashedPassword,
      status: 'active',
    });

    await HeraAction.create({
      ceo_id: ceoId,
      employee_id: employee._id,
      action_type: 'onboarding_started',
      details: {
        employee_name: employee.name,
        department: employee.department,
        role: employee.role,
      },
      triggered_by: 'hera_auto',
    });

    await mailService.sendWelcomeEmail(
      employee.email,
      employee.name,
      tempPassword
    );

    res.status(201).json({
      success: true,
      message: 'Onboarding réussi',
      employee,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
exports.getLeaves = async (req, res) => {
  try {
    const result = await leaveRequestService.getEmployeeLeaves(req.params.employee_id);
    res.json(result);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

exports.getLeaveHistory = async (req, res) => {
  try {
    const result = await leaveRequestService.getLeaveHistory(req.params.employee_id);
    res.json(result);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

exports.getHistory = async (req, res) => {
  try {
    const result = await leaveRequestService.getEmployeeHistory(req.params.employee_id);
    res.json(result);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

exports.promote = async (req, res) => {
  try {
    const { employee_id, new_role } = req.body;
    const result = await employeeManagementService.promoteEmployee(employee_id, new_role);
    res.json(result);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
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
    const ceoId = req.user.id;
    const result = await employeeManagementService.getAdminStats(ceoId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
exports.getAllEmployees = async (req, res) => {
  try {
    const result = await employeeManagementService.getAllEmployees(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
exports.getRecentActions = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 8;

    const recentActions = await HeraAction.find({
      ceo_id: req.user.id,
    })
      .sort({ created_at: -1 })
      .limit(limit)
      .populate('employee_id', 'name role')
      .lean();

    const formattedActions = recentActions.map(action => ({
      _id: action._id,
      employee_name: action.employee_id?.name || 'Système',
      action_type: action.action_type,
      details: action.details,
      created_at: action.created_at,
      badge: action.triggered_by === 'hera_auto' ? 'IA' : 'ADMIN',
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

    // ⚡ CONSUME ENERGY FOR EMPLOYEE ANALYSIS (resignation processing) - SECURED
    let energyConsumed = 0;
    try {
      const energyResult = await CentralizedEnergyService.consumeForAutonomous({
        agentName: 'hera',
        taskType: 'EMPLOYEE_ANALYSIS',
        taskDescription: `Processed resignation for ${employee.name}`,
        metadata: { 
          employeeId: employee._id,
          employeeName: employee.name,
          processType: 'resignation',
          source: 'hera_controller'
        }
      });
      
      if (energyResult.success) {
        energyConsumed = energyResult.energyCost;
        console.log(`⚡ [HERA] Energy consumed successfully: ${energyResult.energyCost} from user ${energyResult.validatedUserId}`);
      } else if (energyResult.blocked) {
        console.warn(`⛔ HERA energy blocked: ${energyResult.securityReason || energyResult.error}`);
        // Continue with resignation processing even if energy is blocked
        // This preserves existing behavior where HR processes continue regardless of energy
      } else {
        console.warn(`⚠️ [HERA] Energy consumption failed: ${energyResult.error} - Continuing with resignation processing`);
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
    const rawLogs = await HeraAction.find({
      ceo_id: req.user.id,
    })
      .sort({ created_at: -1 })
      .limit(10)
      .populate('employee_id', 'name');

    const prompt = `
Tu es Dexo, le Superviseur de l'écosystème E-Team.
Analyse ces logs système et transforme-les en JSON.

LOGS:
${JSON.stringify(rawLogs)}

Retourne uniquement:
{
  "interactions": [
    {
      "id": "ID_DU_LOG",
      "sender": "hera|echo|timo|dexo|kash",
      "receiver": "hera|echo|timo|dexo|kash",
      "actionType": "type",
      "summary": "phrase",
      "timestamp": "ISO_DATE",
      "status": "success"
    }
  ]
}
`;

    const aiResponse = await heraAgent.llm.invoke(prompt);
    const cleanJson = aiResponse.content.match(/\{.*\}/s)[0];
    const parsedData = JSON.parse(cleanJson);

    res.json({ success: true, ...parsedData });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "L'IA n'a pas pu interpréter les logs.",
    });
  }
};
// controllers/heraController.js

exports.getAgentInteractionStats = async (req, res) => {
  try {
    const ceoId = req.user.id;

    const total = await HeraAction.countDocuments({ ceo_id: ceoId });

    const encrypted = await HeraAction.countDocuments({
      ceo_id: ceoId,
      action_type: 'doc_request',
    });

    const successful =
      await HeraAction.countDocuments({
        ceo_id: ceoId,
        action_type: { $in: ['absence_alert', 'offboarding_started'] },
      }) + encrypted;

    res.json({
      success: true,
      stats: {
        total,
        successful,
        encrypted,
        pending: 0,
        failed: 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
// GET /api/hera/admin/actions?page=&limit=
// Returns paginated HeraActions scoped to the authenticated CEO.
exports.getAllActions = async (req, res) => {
  try {
    const ceoId = req.user.id;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [actions, total] = await Promise.all([
      HeraAction.find({ ceo_id: ceoId })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('employee_id', 'name role')
        .lean(),
      HeraAction.countDocuments({ ceo_id: ceoId }),
    ]);

    const formatted = actions.map(action => ({
      _id: action._id,
      employee_name: action.employee_id?.name || 'Système',
      action_type: action.action_type,
      details: action.details,
      created_at: action.created_at,
      badge: action.triggered_by === 'hera_auto' ? 'IA' : 'ADMIN',
    }));

    return res.json({
      success: true,
      actions: formatted,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('❌ getAllActions error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/hera/admin/action/:actionId
// Deletes a HeraAction only if it belongs to the authenticated CEO.
exports.deleteAction = async (req, res) => {
  try {
    const ceoId    = req.user.id;
    const actionId = req.params.actionId;

    const deleted = await HeraAction.findOneAndDelete({
      _id: actionId,
      ceo_id: ceoId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Action introuvable ou accès refusé',
      });
    }

    return res.json({ success: true, message: 'Action supprimée' });
  } catch (err) {
    console.error('❌ deleteAction error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
exports.sendEmailToEcho = (req, res) => res.json({ success: true, message: "Envoyé" });
exports.receiveEmailFromEcho = (req, res) => res.json({ success: true, message: "Reçu" });


// ══════════════════════════════════════════════════════════════════════════
// MANAGER PORTAL — Functions added from BackEnd-basbousa
// Requires: requireEmployeeAgentAccess('hera') middleware
// req.ceo    → CEO User document (set by middleware)
// req.employee → Employee document of the requesting manager (set by middleware)
// ══════════════════════════════════════════════════════════════════════════

// POST /api/hera/hr-request
exports.createHrRequest = async (req, res) => {
  try {
    const {
      type,
      department,
      missing_count,
      reason,
      priority,
      target_employee_id,
      layoff_date,
      impact,
    } = req.body;

    let details = {
      type,
      department,
      reason,
      priority,
    };

    // Case: staffing shortage
    if (type === 'staffing_shortage') {
      details.missing_count = missing_count;
      details.status = 'pending_analysis';
    }

    // Case: recruitment request
    if (type === 'recruitment') {
      details.role = req.body.role;
      details.contract_type = req.body.contract_type;
      details.headcount = req.body.headcount;
      details.level = req.body.level;
      details.skills = req.body.skills;
      details.salary_budget = req.body.salary_budget;
      details.status = 'pending_analysis';
    }

    // Case: layoff
    if (type === 'layoff') {
      details.target_employee_id = target_employee_id;
      details.layoff_date = layoff_date;
      details.impact = impact;
      details.status = 'scheduled';

      const targetEmployee = await Employee.findById(target_employee_id);
      if (targetEmployee) {
        await mailService.sendLayoffNoticeEmail(targetEmployee.email, {
          employee_name: targetEmployee.name,
          layoff_date,
        });
      }
    }

    const action = await HeraAction.create({
      ceo_id: req.ceo._id,
      employee_id: req.employee._id,
      action_type: 'hr_request',
      triggered_by: 'manager',
      details,
    });

    res.status(201).json({
      success: true,
      message: 'Demande RH enregistrée',
      action,
    });
  } catch (err) {
    console.error('createHrRequest ERROR:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/hera/hr-requests/:employee_id
exports.getHrRequests = async (req, res) => {
  try {
    const actions = await HeraAction.find({
      ceo_id: req.ceo._id,
      action_type: 'hr_request',
    }).sort({ createdAt: -1 });

    res.json({ success: true, data: actions });
  } catch (err) {
    console.error('getHrRequests ERROR:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/hera/manager/departments/:employee_id
exports.getManagerDepartments = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.employee_id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const ceo = await User.findById(employee.ceo_id);

    const departments = (ceo?.workforceSettings || []).map((w) => ({
      department: w.department,
      targetCount: w.targetCount,
      currentCount: w.currentCount,
    }));

    res.json({ success: true, departments });
  } catch (err) {
    console.error('getManagerDepartments ERROR:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/hera/manager/employees/:employee_id
exports.getManagerEmployees = async (req, res) => {
  try {
    const employees = await Employee.find({
      ceo_id: req.ceo._id,
      _id: { $ne: req.employee._id }, // exclude the requesting manager
    })
      .select('_id name department role')
      .lean();

    res.json({ success: true, employees });
  } catch (err) {
    console.error('getManagerEmployees ERROR:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/hera/manager/dashboard/:employee_id
exports.getManagerDashboard = async (req, res) => {
  try {
    const ceoId = req.ceo._id;

    const teamSize = await Employee.countDocuments({
      ceo_id: ceoId,
      status: { $in: ['active', 'onboarding', 'offboarding'] },
    });

    const onLeave = await LeaveRequest.countDocuments({
      status: 'approved',
      start_date: { $lte: new Date() },
      end_date: { $gte: new Date() },
    });

    const alerts = await HeraAction.countDocuments({
      ceo_id: ceoId,
      action_type: 'hr_request',
      'details.status': { $in: ['pending_analysis', 'scheduled', 'pending_ceo_approval'] },
    });

    const recentActions = await HeraAction.find({ ceo_id: ceoId })
      .sort({ created_at: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      data: {
        teamSize,
        onLeave,
        alerts,
        recentActions,
      },
    });
  } catch (err) {
    console.error('getManagerDashboard ERROR:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
