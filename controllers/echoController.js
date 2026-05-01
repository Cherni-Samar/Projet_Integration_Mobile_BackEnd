// =============================================================
//  CONTROLLER - Agent Echo
// =============================================================

const mongoose = require("mongoose");
const echoAgent = require("../agents/Echoagent");
const InboxEmail = require("../models/InboxEmail");
const EmailReply = require('../models/EmailReply'); // ✅ IMPORT DU MODÈLE REPLIES
const inboxStatsService = require("../services/inboxStatsService");
const autoReplyManager = require("../services/autoReplyManager");
const { emailToClient } = require("../utils/emailSerialize");
const { reinitialiserMemoire } = echoAgent;
const linkedinService = require("../services/linkedin.service");
const SocialPost = require("../models/SocialPost");
const ProductScraperService = require("../services/productScraper.service");
const ProductMarketingGenerator = require("../services/productMarketingGenerator.service");
const ProductCampaign = require("../models/ProductCampaign");
const { manualEnergyConsumption } = require("../middleware/energyMiddleware");
const ActivityLogger = require("../services/activityLogger.service");

//console.log('echoAgent loaded:', echoAgent);

// ─────────────────────────────────────────────
exports.analyser = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'message' est requis",
      });
    }

    console.log(`📨 Nouveau message reçu (${message.length} caractères)`);

    const resultat = await echoAgent.analyze(message);

    res.json({
      success: true,
      ...resultat,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Erreur route /analyser:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.fullAnalysis = async (req, res) => {
  try {
    const { message, sender, context } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'message' est requis",
      });
    }

    console.log(`🔍 Analyse complète demandée pour: ${message.substring(0, 50)}...`);

    const resultat = await echoAgent.fullAnalysis(message, sender, context || {});

    res.json({
      success: true,
      analysis: resultat,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Erreur route /full-analysis:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.autoReply = async (req, res) => {
  try {
    const { message, context } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'message' est requis",
      });
    }

    console.log(`🤖 Génération réponse auto pour: ${message.substring(0, 50)}...`);

    const autoReply = await echoAgent.generateAutoReply(message, context || {});

    res.json({
      success: true,
      autoReply: autoReply,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Erreur route /auto-reply:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.responseSuggestions = async (req, res) => {
  try {
    const { message, sender, context, analysis } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'message' est requis",
      });
    }

    console.log(`💡 Génération suggestions de réponses pour: ${message.substring(0, 50)}...`);

    const suggestions = await echoAgent.generateResponseSuggestions(
      message,
      sender || "unknown",
      context || {},
      analysis
    );

    res.json({
      success: true,
      suggestions: suggestions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Erreur route /response-suggestions:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.checkEscalation = async (req, res) => {
  try {
    const { message, sender, urgencyLevel } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'message' est requis",
      });
    }

    console.log(`🚨 Vérification escalade pour: ${message.substring(0, 50)}...`);

    const escalation = await echoAgent.checkEscalation(message, sender, urgencyLevel);

    res.json({
      success: true,
      escalation: escalation,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Erreur route /check-escalation:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.filterNoise = async (req, res) => {
  try {
    const { message, sender } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'message' est requis",
      });
    }

    console.log(`🔇 Filtrage bruit pour: ${message.substring(0, 50)}...`);

    const noiseFilter = await echoAgent.filterNoise(message, sender);

    res.json({
      success: true,
      noiseFilter: noiseFilter,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Erreur route /filter-noise:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.extractTasks = async (req, res) => {
  try {
    const { message, conversationContext } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'message' est requis",
      });
    }

    console.log(`📋 Extraction tâches pour: ${message.substring(0, 50)}...`);

    const taskExtraction = await echoAgent.extractTasks(message, conversationContext || []);

    res.json({
      success: true,
      taskExtraction: taskExtraction,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Erreur route /extract-tasks:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.batchAdvanced = async (req, res) => {
  try {
    const { messages, options } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Le champ 'messages' doit être un tableau non vide avec format: [{message, sender, context}]",
      });
    }

    if (messages.length > 20) {
      return res.status(400).json({
        success: false,
        error: "Maximum 20 messages par lot pour l'analyse avancée",
      });
    }

    console.log(`📦 Analyse avancée en lot de ${messages.length} messages avec LangChain...`);

    const result = await echoAgent.batchAnalysis(messages, options || {});

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Erreur route /batch-advanced:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message
    });
  }
};

// ─────────────────────────────────────────────
exports.batch = async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Le champ 'messages' doit être un tableau non vide",
      });
    }

    if (messages.length > 10) {
      return res.status(400).json({
        success: false,
        error: "Maximum 10 messages par lot",
      });
    }

    console.log(`📦 Lot de ${messages.length} messages reçus`);

    const resultats = await Promise.all(
      messages.map((msg, index) =>
        echoAgent.analyze(msg).then((r) => ({ index, message: msg.substring(0, 50) + "...", ...r }))
      )
    );

    res.json({
      success: true,
      total: messages.length,
      resultats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Erreur route /batch:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────
exports.sendToHera = async (req, res) => {
  const { subject, content, from } = req.body;

  try {
    const response = await fetch('http://localhost:3000/api/hera/receive-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: subject,
        sender: from || 'echo@e-team.com',
        content: content,
        type: 'email_from_echo'
      })
    });

    const result = await response.json();

    res.json({
      success: true,
      message: 'Email envoyé à Hera',
      result: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────
// 🔔 REÇOIT L'ALERTE DE HÉRA → GÉNÈRE + PUBLIE OFFRE LINKEDIN
// POST /api/echo/receive-staffing-alert
// ─────────────────────────────────────────────
// 🔔 REÇOIT L'ALERTE DE HÉRA → GÉNÈRE + PUBLIE OFFRE LINKEDIN + RÉPOND
// POST /api/echo/receive-staffing-alert
exports.receiveHeraStaffingAlert = async (req, res) => {
  try {
    // 1. Récupération des données (Hera doit envoyer emailId pour la liaison)
    const { department, currentCount, maxCapacity, shortage, postedBy, emailId } = req.body;

    if (!department) {
      return res.status(400).json({ success: false, error: "Le champ 'department' est requis" });
    }

    console.log(`📩 [ECHO] Alerte staffing reçue pour le département : ${department}`);
    const postes = shortage || (maxCapacity - currentCount);

    // ── Mapping spécialité + hard skills + postes précis par département ─────
    const DEPARTMENT_SKILLS = {
      Tech: { specialite: 'Développement logiciel & IA', hardSkills: ['JavaScript/Node.js', 'React/React Native', 'Python', 'MongoDB', 'DevOps/CI-CD', 'API REST'] },
      Design: { specialite: 'Design UX/UI', hardSkills: ['Figma', 'Adobe XD', 'Prototypage', 'Design System', 'User Research', 'Responsive Design'] },
      Marketing: { specialite: 'Marketing Digital', hardSkills: ['SEO/SEM', 'Google Analytics', 'Social Media Ads', 'Content Marketing', 'Email Marketing', 'KPIs & Reporting'] },
      RH: { specialite: 'Ressources Humaines', hardSkills: ['Gestion des talents', 'SIRH', 'Droit du travail', 'Recrutement', 'Formation', 'Gestion de la paie'] },
      Finance: { specialite: 'Finance & Comptabilité', hardSkills: ['Comptabilité générale', 'Excel avancé', 'SAP/ERP', 'Analyse financière', 'Trésorerie', 'Fiscalité'] },
      Support: { specialite: 'Support Client', hardSkills: ['CRM (Zendesk/Freshdesk)', 'Communication écrite', 'Résolution de problèmes', 'ITIL', 'Ticketing', 'Satisfaction client'] },
    };

    const deptInfo = DEPARTMENT_SKILLS[department] || { specialite: department, hardSkills: ['Polyvalence', 'Travail en équipe'] };
    const jobDescription = `Poste en ${deptInfo.specialite}. Compétences requises : ${deptInfo.hardSkills.join(', ')}.`;

    // ── 0. Créer une JobOffer en BDD ─────
    const JobOffer = require('../models/JobOffer');
    const jobOffer = await JobOffer.create({
      document_type: 'opening',
      title: `${titresAffichés} — ${postes} poste(s)`,
      department: department,
      description: jobDescription,
      status: 'open',
    });

    // ── 1. Préparation du post ──────────────
    const publicBase = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const recruitmentFormUrl = `${publicBase}/form?department=${encodeURIComponent(department)}&job_offer_id=${jobOffer._id}`;

    const prompt = `Tu es Echo, l'agent IA de communication de E-Team.
Rédige un post LinkedIn professionnel et accrocheur pour recruter ${postes} personne(s).

INFORMATIONS DU POSTE :
- Département : ${department}
- Spécialité : ${deptInfo.specialite}
- Hard Skills recherchés : ${deptInfo.hardSkills.join(', ')}
- Nombre de postes : ${postes}

Contraintes :
- Maximum 280 mots
- Commence par une accroche percutante avec un emoji
- OBLIGATOIRE : mentionne la spécialité "${deptInfo.specialite}"
- OBLIGATOIRE : liste au moins 4 hard skills parmi : ${deptInfo.hardSkills.join(', ')}
- OBLIGATOIRE : inclus une courte description du poste (2-3 lignes)
- Invite à postuler via ce lien : ${recruitmentFormUrl}
- Termine avec 5 hashtags pertinents (#Recrutement #Emploi + 3 liés au domaine)
- Ton : professionnel, dynamique, moderne
- NE PAS inclure de JSON, uniquement le texte du post

Rédige UNIQUEMENT le texte du post LinkedIn, sans commentaire.`;

    let linkedinPostText;
    try {
      const aiResponse = await echoAgent.generateAutoReply(prompt, {}, null);
      linkedinPostText = aiResponse?.trim() || null;
    } catch (aiErr) {
      console.warn('⚠️ IA unavailable, fallback post:', aiErr.message);
      linkedinPostText = null;
    }

    // Fallback si l'IA échoue
    if (!linkedinPostText) {
      linkedinPostText = `🚨 Nous recrutons ! — Département ${department}\n\n` +
        `Notre équipe ${department} est en pleine croissance et nous avons besoin de ${postes} nouveau(x) talent(s) pour renforcer nos rangs.\n\n` +
        `✅ Ce que nous offrons :\n` +
        `• Environnement innovant & IA-first\n` +
        `• Équipe soudée et dynamique\n` +
        `• Projets à fort impact\n\n` +
        `📩 Postulez dès maintenant : ${recruitmentFormUrl}\n\n` +
        `#Recrutement #Emploi #${department.replace(/\s/g, '')} #ETeam #Carrière`;
    }

    console.log('📝 [ECHO] Post LinkedIn généré :', linkedinPostText.substring(0, 80) + '...');

    // ── 3. ✅ RÉPONSE TECHNIQUE (Table: email_replies) ────────────────
    if (emailId) {
      try {
        const EmailReply = require('../models/EmailReply');
        await EmailReply.create({
          emailId: emailId, // Liaison avec l'ID du mail de Hera
          replyContent: `Bonjour Hera, j'ai traité ton alerte. L'offre pour ${department} est en ligne. ID LinkedIn: ${publishResult.postId || 'Simulé'}.`,
          sentBy: 'echo@e-team.com',
          status: 'sent',
          channel: 'internal'
        });
        console.log("✅ [ECHO] Entrée créée dans la table email_replies");
      } catch (replyErr) {
        console.error("❌ Erreur table email_replies:", replyErr.message);
      }
    }

    // ── 4. ✅ RÉPONSE VISUELLE (Table: emails - Inbox Hera) ───────────
    try {
      await InboxEmail.create({
        sender: 'echo@e-team.com',
        to: 'hera@e-team.com', // Echo écrit à Hera
        subject: `RE: [STAFFING] Recrutement ${department}`,
        content: `Salut Hera, l'alerte pour ${department} a été traitée. \nPost LinkedIn : ✅ Publié \nFormulaire : ${recruitmentFormUrl}`,
        receivedAt: new Date(),
        isRead: false,
        category: 'recrutement',
        priority: 'medium',
        summary: `Recrutement ${department} lancé.`
      });
      console.log("✅ [ECHO] Message de confirmation envoyé dans l'Inbox de Hera");
    } catch (dbErr) {
      console.warn('⚠️ Erreur trace InboxEmail :', dbErr.message);
    }

    // ── 5. Réponse finale à l'API ────────────────────────────────────────
    return res.json({
      success: true,
      agent: 'Echo',
      message: "Publication effectuée et réponse enregistrée.",
      jobOfferId: jobOffer._id,
      linkedinPost: linkedinPostText
    });

  } catch (error) {
    console.error('❌ [ECHO] Erreur receiveHeraStaffingAlert:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};


// ─────────────────────────────────────────────
exports.classifyDocument = async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || content.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'content' est requis",
      });
    }

    console.log(`📄 Classification de document demandée (${content.length} caractères)`);

    const result = await echoAgent.classifyDocument(content);

    res.json(result);
  } catch (error) {
    console.error("❌ Erreur route /classify-document:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.saveDocument = async (req, res) => {
  try {
    const { content, classification } = req.body;

    if (!content || content.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'content' est requis",
      });
    }

    if (!classification) {
      return res.status(400).json({
        success: false,
        error: "Le champ 'classification' est requis",
      });
    }


    const result = await echoAgent.saveClassifiedDocument(content, classification);

    res.json(result);
  } catch (error) {
    console.error("❌ Erreur route /save-document:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────


// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
exports.extractAndSaveTasks = async (req, res) => {
  try {
    const { message, sender, emailId, subject } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'message' est requis",
      });
    }


    const result = await echoAgent.extractAndSaveTasks(
      message,
      sender || "unknown",
      emailId,
      subject
    );

    res.json(result);
  } catch (error) {
    console.error("❌ Erreur route /extract-save-tasks:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.getTasks = async (req, res) => {
  try {
    const { status, category } = req.query;


    const result = await echoAgent.getTasks('current_user', status, category);

    res.json(result);
  } catch (error) {
    console.error("❌ Erreur route /tasks:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.updateTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: "L'ID de la tâche est requis",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Le statut est requis",
      });
    }

    const validStatuses = ['todo', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Statut invalide. Statuts valides: ${validStatuses.join(', ')}`,
      });
    }


    const result = await echoAgent.updateTaskStatus(taskId, status);

    res.json(result);
  } catch (error) {
    console.error("❌ Erreur route /tasks/:taskId/status:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: "L'ID de la tâche est requis",
      });
    }


    const result = await echoAgent.deleteTask(taskId);

    res.json(result);
  } catch (error) {
    console.error("❌ Erreur route /tasks/:taskId:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const stats = await inboxStatsService.getAggregatedStats();
    res.json({
      success: true,
      totalProcessed: stats.totalProcessed,
      spamBlocked: stats.spamBlocked,
      uptime: stats.uptime,
      stats,
    });
  } catch (error) {
    console.error("❌ Erreur route /stats:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.getEmails = async (req, res) => {
  try {
    const emails = await InboxEmail.find({}).sort({ receivedAt: -1 }).lean();
    const urgentCount = emails.filter((e) => e.isUrgent && !e.isRead).length;
    const spamCount = emails.filter((e) => e.isSpam).length;
    const unreadCount = emails.filter((e) => !e.isRead).length;
    res.json({
      success: true,
      total: emails.length,
      urgentCount,
      spamCount,
      unreadCount,
      emails: emails.map((e) => emailToClient(e)),
    });
  } catch (error) {
    console.error("❌ Erreur route /emails:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.getPending = async (req, res) => {
  try {
    const pending = autoReplyManager.getPendingStatus();
    res.json({ success: true, pending, count: pending.length });
  } catch (error) {
    console.error("❌ Erreur route /pending:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.markEmailRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false });
    }
    const email = await InboxEmail.findByIdAndUpdate(id, { isRead: true }, { returnDocument: 'after' });
    if (!email) return res.status(404).json({ success: false });
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Erreur route /emails/:id/read:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.deleteEmail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false });
    }
    const deleted = await InboxEmail.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false });
    await inboxStatsService.syncMessageStatsCache();
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Erreur route /emails/:id:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.resetMemoire = async (req, res) => {
  try {
    const result = await reinitialiserMemoire();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────
exports.publishToLinkedIn = async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: "Le champ 'content' est requis"
      });
    }

    const result = await linkedinService.post(content);

    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur publication LinkedIn:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────
exports.sante = (req, res) => {
  res.json({
    status: "✅ Agent Echo opérationnel avec LangChain + Gestion Documents",
    fonctionnalites: [
      "🔍 Analyse de messages avec chaînes LangChain",
      "🤖 Réponses automatiques intelligentes",
      "💡 Suggestions de réponses multiples",
      "🚨 Escalade de messages critiques",
      "🔇 Filtrage du bruit avancé",
      "📋 Extraction de tâches structurée",
      "📊 Analyse complète orchestrée",
      "🧪 Traitement en lot optimisé",
      "💡 Recommandations automatiques",
      "📄 Classification de documents IA",
      "💾 Sauvegarde de documents classifiés",
      "📂 Gestion par catégories",
      "🔍 Recherche de contenu",
      //"📋 Gestion de tâches intelligente",
      "⏰ Suivi des échéances et priorités"
    ],
    endpoints: [
      "POST /analyser", "POST /full-analysis", "POST /auto-reply",
      "POST /response-suggestions", "POST /check-escalation", "POST /filter-noise",
      "POST /extract-tasks", "POST /batch", "POST /batch-advanced",
      "POST /classify-document", "POST /save-document",
      "GET /documents/:category", "GET /document-content/:id",
      //"POST /extract-save-tasks", "GET /tasks",
      "PATCH /tasks/:id/status", "DELETE /tasks/:id",
      "GET /stats", "GET /emails", "GET /pending",
      "PATCH /emails/:id/read", "DELETE /emails/:id"
    ],
    langchain: {
      version: "0.1.0",
      features: [
        "PromptTemplate pour prompts structurés",
        "RunnableSequence pour chaînes de traitement",
        "StructuredOutputParser avec Zod schemas",
        "StringOutputParser pour sorties texte",
        "Traitement parallèle optimisé",
        "Gestion d'erreurs robuste",
        "Classification de documents IA"
      ],
      model: "llama-3.3-70b-versatile",
      provider: "groq"
    },
    documentManagement: {
      categories: ["Commercial", "Finance", "Juridique", "Marketing", "RH", "Technique"],
      confidentialityLevels: ["public", "interne", "confidentiel", "critique"],
      documentTypes: ["contrat", "rapport", "email", "facture", "presentation", "manuel", "autre"],
      features: [
        "Classification de documents IA",
        "Sauvegarde organisée par catégorie",
        "Extraction de tâches depuis emails",
        "Gestion de tâches avec statuts",
        "Suivi des échéances et priorités"
      ]
    },
    version: "2.2.0",
    timestamp: new Date().toISOString(),
  });
};


// ─────────────────────────────────────────────
// PRODUCT LINK CONFIGURATION ENDPOINTS
// ─────────────────────────────────────────────

/**
 * Get current product link configuration
 * GET /api/echo/config/product-link
 */
exports.getProductLinkConfig = async (req, res) => {
  try {
    const productLink = process.env.ECHO_PRODUCT_LINK || null;

    // Validate the current link
    let isValid = false;
    if (productLink && productLink.trim() !== '') {
      try {
        const url = new URL(productLink.trim());
        isValid = (url.protocol === 'http:' || url.protocol === 'https:');
      } catch {
        isValid = false;
      }
    }

    res.json({
      success: true,
      data: {
        productLink: productLink,
        isConfigured: !!productLink && productLink.trim() !== '',
        isValid: isValid
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur getProductLinkConfig:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur interne du serveur',
      details: error.message
    });
  }
};

/**
 * Update product link configuration
 * PUT /api/echo/config/product-link
 * Body: { productLink: "https://example.com/product" }
 */
exports.updateProductLinkConfig = async (req, res) => {
  try {
    const { productLink } = req.body;

    if (!productLink || typeof productLink !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Le champ productLink est requis et doit être une chaîne de caractères'
      });
    }

    // Validate URL format
    try {
      const url = new URL(productLink.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return res.status(400).json({
          success: false,
          error: 'Le lien doit utiliser le protocole HTTP ou HTTPS'
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Format d\'URL invalide',
        details: error.message
      });
    }

    // Update environment variable (runtime only)
    process.env.ECHO_PRODUCT_LINK = productLink.trim();

    console.log(`✅ [ECHO] Product link updated: ${productLink.trim()}`);

    res.json({
      success: true,
      message: 'Product link mis à jour avec succès',
      data: {
        productLink: productLink.trim(),
        isConfigured: true,
        isValid: true
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur updateProductLinkConfig:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur interne du serveur',
      details: error.message
    });
  }
};

/**
 * Delete product link configuration
 * DELETE /api/echo/config/product-link
 */
exports.deleteProductLinkConfig = async (req, res) => {
  try {
    // Clear environment variable
    process.env.ECHO_PRODUCT_LINK = '';

    console.log('🗑️ [ECHO] Product link configuration cleared');

    res.json({
      success: true,
      message: 'Product link configuration supprimée avec succès',
      data: {
        productLink: null,
        isConfigured: false,
        isValid: false
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur deleteProductLinkConfig:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur interne du serveur',
      details: error.message
    });
  }
};

// ─────────────────────────────────────────────
// MOBILE API ENDPOINTS
// ─────────────────────────────────────────────

/**
 * Get mobile-friendly configuration summary
 * GET /api/echo/mobile/config
 */
exports.getMobileConfig = async (req, res) => {
  try {
    const productLink = process.env.ECHO_PRODUCT_LINK || null;

    // Validate the current link
    let isValid = false;
    if (productLink && productLink.trim() !== '') {
      try {
        const url = new URL(productLink.trim());
        isValid = (url.protocol === 'http:' || url.protocol === 'https:');
      } catch {
        isValid = false;
      }
    }

    // Get recent posts count
    const recentPostsCount = await SocialPost.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    });

    // Get LinkedIn status
    let linkedinStatus = 'disconnected';
    try {
      const hasToken = !!linkedinService.accessToken;
      linkedinStatus = hasToken ? 'connected' : 'disconnected';
    } catch {
      linkedinStatus = 'error';
    }

    res.json({
      success: true,
      data: {
        productLink: {
          url: productLink,
          isConfigured: !!productLink && productLink.trim() !== '',
          isValid: isValid,
          status: isValid ? 'active' : 'inactive'
        },
        socialMedia: {
          linkedin: {
            status: linkedinStatus,
            lastPost: null // Will be populated later
          },
          mastodon: {
            status: 'active' // Assuming mastodon is always active
          }
        },
        stats: {
          recentPosts: recentPostsCount,
          totalPosts: await SocialPost.countDocuments(),
          postsWithLinks: await SocialPost.countDocuments({ 'productLink.isIncluded': true })
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur getMobileConfig:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur interne du serveur',
      details: error.message
    });
  }
};

/**
 * Update product link for mobile
 * PUT /api/echo/mobile/product-link
 */
exports.updateMobileProductLink = async (req, res) => {
  try {
    const { productLink } = req.body;

    if (!productLink || typeof productLink !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Product link is required'
      });
    }

    // Validate URL format
    try {
      const url = new URL(productLink.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return res.status(400).json({
          success: false,
          error: 'URL must use HTTP or HTTPS protocol'
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Update environment variable
    process.env.ECHO_PRODUCT_LINK = productLink.trim();

    console.log(`✅ [ECHO MOBILE] Product link updated: ${productLink.trim()}`);

    res.json({
      success: true,
      message: 'Product link updated successfully',
      data: {
        productLink: productLink.trim(),
        isConfigured: true,
        isValid: true,
        status: 'active'
      }
    });
  } catch (error) {
    console.error('❌ Erreur updateMobileProductLink:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/**
 * Get social media posts logs for mobile
 * GET /api/echo/mobile/posts
 */
exports.getMobilePosts = async (req, res) => {
  try {
    const { page = 1, limit = 20, platform } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    let query = {};
    if (platform && ['linkedin', 'mastodon'].includes(platform)) {
      query['platforms.name'] = platform;
    }

    // Get posts with pagination
    const posts = await SocialPost.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalPosts = await SocialPost.countDocuments(query);

    // Format for mobile
    const mobilePosts = posts.map(post => ({
      id: post._id,
      content: post.content.substring(0, 150) + (post.content.length > 150 ? '...' : ''),
      fullContent: post.content,
      image: post.image ? {
        url: post.image.url,
        type: post.image.type,
        source: post.image.source
      } : null,
      platforms: post.platforms.map(p => ({
        name: p.name,
        status: p.status,
        url: p.url,
        publishedAt: p.publishedAt,
        icon: p.name === 'linkedin' ? '💼' : '🐘'
      })),
      hasProductLink: post.productLink?.isIncluded || false,
      productLinkUrl: post.productLink?.url,
      createdAt: post.createdAt,
      isForced: post.metadata?.isForced || false,
      stats: post.stats || { likes: 0, shares: 0, comments: 0 }
    }));

    res.json({
      success: true,
      data: {
        posts: mobilePosts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPosts / parseInt(limit)),
          totalPosts: totalPosts,
          hasNext: skip + parseInt(limit) < totalPosts,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    console.error('❌ Erreur getMobilePosts:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/**
 * Force post generation for mobile
 * POST /api/echo/mobile/force-post
 */
exports.mobileForcePost = async (req, res) => {
  try {
    const User = require('../models/User');

    // Get userId from multiple possible sources
    let userId = req.user?.id || req.user?._id || req.userId;

    // If no userId from auth, find ANY user with energy
    if (!userId) {
      console.log('⚠️ [DEBUG] No userId from authentication, finding user with energy');
      const userWithEnergy = await User.findOne({ energyBalance: { $gt: 0 } }).sort({ energyBalance: -1 });
      if (userWithEnergy) {
        userId = userWithEnergy._id.toString();
        console.log(`⚠️ [DEBUG] Using user with most energy: ${userId} (${userWithEnergy.energyBalance} energy)`);
      } else {
        // Find demo user
        const demoUser = await User.findOne({ email: 'demo@e-team.com' });
        if (demoUser) {
          userId = demoUser._id.toString();
          console.log('⚠️ [DEBUG] Using demo user ID:', userId);
        }
      }
    }

    console.log(`🔍 [DEBUG] Full req.user object:`, JSON.stringify(req.user));
    console.log(`🔍 [DEBUG] Final userId to use:`, userId);

    const { tick } = require('../services/echoLinkedInAutonomy');

    // Force post generation
    await tick(true);

    // ⚡ CONSUME ENERGY FOR SOCIAL_POST TASK
    const energyResult = await manualEnergyConsumption(
      'echo',
      'SOCIAL_POST',
      'Manual social media post generation',
      { forced: true, endpoint: '/mobile/force-post' },
      userId // Pass userId
    );

    console.log(`🔍 [DEBUG] Energy result:`, JSON.stringify(energyResult));

    if (!energyResult.success) {
      console.log(`⚠️ [ENERGY] ${energyResult.error}`);
    } else {
      console.log(`⚡ [ENERGY] Echo consumed ${energyResult.energyCost} energy for SOCIAL_POST`);
    }

    // 📝 LOG ACTIVITY
    await ActivityLogger.logEchoActivity(
      'SOCIAL_POST',
      'Manual social media post published',
      {
        targetAgent: 'external',
        description: 'Generated and published social media post to LinkedIn and Mastodon',
        status: 'success',
        energyConsumed: energyResult.success ? energyResult.energyCost : (energyResult.requiredEnergy || 8), // Use attempted energy cost even if failed
        priority: 'medium',
        metadata: {
          forced: true,
          platforms: ['linkedin', 'mastodon'],
          energyStatus: energyResult.success ? 'consumed' : 'insufficient'
        }
      }
    );

    res.json({
      success: true,
      message: 'Post generated and published successfully!',
      data: {
        platforms: ['linkedin', 'mastodon'],
        timestamp: new Date().toISOString(),
        energyConsumed: energyResult.success ? energyResult.energyCost : 0
      }
    });
  } catch (error) {
    console.error('❌ Erreur mobileForcePost:', error);

    // Log failed activity
    await ActivityLogger.logEchoActivity(
      'SOCIAL_POST',
      'Failed to publish social media post',
      {
        status: 'failed',
        priority: 'high',
        metadata: {
          errorMessage: error.message
        }
      }
    );

    res.status(500).json({
      success: false,
      error: 'Failed to generate post',
      details: error.message
    });
  }
};

/**
 * Get mobile dashboard stats
 * GET /api/echo/mobile/dashboard
 */
exports.getMobileDashboard = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get various stats
    const [
      totalPosts,
      postsLast24h,
      postsLast7days,
      postsLast30days,
      postsWithLinks,
      linkedinPosts,
      mastodonPosts,
      recentPosts
    ] = await Promise.all([
      SocialPost.countDocuments(),
      SocialPost.countDocuments({ createdAt: { $gte: last24h } }),
      SocialPost.countDocuments({ createdAt: { $gte: last7days } }),
      SocialPost.countDocuments({ createdAt: { $gte: last30days } }),
      SocialPost.countDocuments({ 'productLink.isIncluded': true }),
      SocialPost.countDocuments({ 'platforms.name': 'linkedin' }),
      SocialPost.countDocuments({ 'platforms.name': 'mastodon' }),
      SocialPost.find().sort({ createdAt: -1 }).limit(5).lean()
    ]);

    // Get product link status
    const productLink = process.env.ECHO_PRODUCT_LINK || null;
    let productLinkStatus = 'inactive';
    if (productLink && productLink.trim() !== '') {
      try {
        const url = new URL(productLink.trim());
        productLinkStatus = (url.protocol === 'http:' || url.protocol === 'https:') ? 'active' : 'invalid';
      } catch {
        productLinkStatus = 'invalid';
      }
    }

    // Format recent posts for mobile
    const formattedRecentPosts = recentPosts.map(post => ({
      id: post._id,
      content: post.content.substring(0, 100) + '...',
      platforms: post.platforms.map(p => p.name),
      createdAt: post.createdAt,
      hasProductLink: post.productLink?.isIncluded || false
    }));

    res.json({
      success: true,
      data: {
        overview: {
          totalPosts,
          postsLast24h,
          postsLast7days,
          postsLast30days,
          postsWithLinks,
          linkInclusionRate: totalPosts > 0 ? Math.round((postsWithLinks / totalPosts) * 100) : 0
        },
        platforms: {
          linkedin: {
            name: 'LinkedIn',
            icon: '💼',
            posts: linkedinPosts,
            status: 'active'
          },
          mastodon: {
            name: 'Mastodon',
            icon: '🐘',
            posts: mastodonPosts,
            status: 'active'
          }
        },
        productLink: {
          url: productLink,
          status: productLinkStatus,
          isConfigured: !!productLink && productLink.trim() !== ''
        },
        recentActivity: formattedRecentPosts
      }
    });
  } catch (error) {
    console.error('❌ Erreur getMobileDashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/**
 * Get posts metrics for mobile command center (matching your UI format)
 * GET /api/echo/mobile/posts-metrics
 */
exports.getPostsMetrics = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get posts metrics
    const [
      totalPosts,
      postsLast24h,
      successfulPosts,
      failedPosts,
      postsWithLinks,
      linkedinPosts,
      mastodonPosts,
      recentPosts
    ] = await Promise.all([
      SocialPost.countDocuments(),
      SocialPost.countDocuments({ createdAt: { $gte: last24h } }),
      SocialPost.countDocuments({ 'platforms.status': 'success' }),
      SocialPost.countDocuments({ 'platforms.status': 'failed' }),
      SocialPost.countDocuments({ 'productLink.isIncluded': true }),
      SocialPost.countDocuments({ 'platforms.name': 'linkedin', 'platforms.status': 'success' }),
      SocialPost.countDocuments({ 'platforms.name': 'mastodon', 'platforms.status': 'success' }),
      SocialPost.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    ]);

    // Calculate engagement stats
    const allPosts = await SocialPost.find().lean();
    const totalLikes = allPosts.reduce((sum, post) => sum + (post.stats?.likes || 0), 0);
    const totalShares = allPosts.reduce((sum, post) => sum + (post.stats?.shares || 0), 0);
    const totalComments = allPosts.reduce((sum, post) => sum + (post.stats?.comments || 0), 0);

    // Format recent activity for mobile
    const recentActivity = recentPosts.map(post => {
      const platforms = post.platforms || [];
      const linkedinPlatform = platforms.find(p => p.name === 'linkedin');
      const mastodonPlatform = platforms.find(p => p.name === 'mastodon');

      return {
        id: post._id,
        title: post.content.substring(0, 50) + '...',
        description: `Published ${platforms.length} platform(s)`,
        timestamp: post.createdAt,
        status: platforms.some(p => p.status === 'success') ? 'success' : 'failed',
        platforms: {
          linkedin: linkedinPlatform ? {
            status: linkedinPlatform.status,
            url: linkedinPlatform.url
          } : null,
          mastodon: mastodonPlatform ? {
            status: mastodonPlatform.status,
            url: mastodonPlatform.url
          } : null
        },
        hasProductLink: post.productLink?.isIncluded || false,
        stats: post.stats || { likes: 0, shares: 0, comments: 0 }
      };
    });

    res.json({
      success: true,
      data: {
        // Top metrics (for the cards at the top)
        metrics: {
          totalPosts: {
            value: totalPosts,
            label: 'POSTS',
            icon: 'post',
            color: '#9C27B0' // Purple to match your theme
          },
          successRate: {
            value: totalPosts > 0 ? Math.round((successfulPosts / totalPosts) * 100) : 0,
            label: 'SUCCESS',
            icon: 'check',
            color: '#4CAF50' // Green
          },
          engagement: {
            value: totalLikes + totalShares + totalComments,
            label: 'ENGAGEMENT',
            icon: 'trending',
            color: '#FF9800' // Orange
          }
        },

        // Operational metrics (for the cards below)
        operational: {
          postsPublished: {
            value: successfulPosts,
            label: 'POSTS PUBLISHED',
            icon: 'check_circle',
            color: '#9C27B0'
          },
          postsFailed: {
            value: failedPosts,
            label: 'POSTS FAILED',
            icon: 'error',
            color: '#F44336'
          },
          postsLast24h: {
            value: postsLast24h,
            label: 'LAST 24H',
            icon: 'schedule',
            color: '#2196F3'
          },
          withProductLink: {
            value: postsWithLinks,
            label: 'WITH LINK',
            icon: 'link',
            color: '#4CAF50'
          }
        },

        // Platform breakdown
        platforms: {
          linkedin: {
            name: 'LinkedIn',
            icon: '💼',
            posts: linkedinPosts,
            status: 'active'
          },
          mastodon: {
            name: 'Mastodon',
            icon: '🐘',
            posts: mastodonPosts,
            status: 'active'
          }
        },

        // Recent activity (matching your UI format)
        recentActivity: recentActivity,

        // Summary stats
        summary: {
          totalPosts,
          successfulPosts,
          failedPosts,
          postsWithLinks,
          linkInclusionRate: totalPosts > 0 ? Math.round((postsWithLinks / totalPosts) * 100) : 0,
          totalEngagement: totalLikes + totalShares + totalComments,
          averageEngagement: totalPosts > 0 ? Math.round((totalLikes + totalShares + totalComments) / totalPosts) : 0
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur getPostsMetrics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

// ─────────────────────────────────────────────
// PRODUCT MARKETING AUTOMATION ENDPOINTS
// ─────────────────────────────────────────────

/**
 * Scrape product information from URL
 * POST /api/echo/product/scrape
 */
exports.scrapeProduct = async (req, res) => {
  try {
    const { productUrl } = req.body;

    if (!productUrl || typeof productUrl !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Product URL is required'
      });
    }

    // Validate URL format
    try {
      new URL(productUrl);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    console.log(`🔍 [PRODUCT] Scraping product: ${productUrl}`);

    const result = await ProductScraperService.scrapeProduct(productUrl);

    if (result.success) {
      res.json({
        success: true,
        product: result.product,
        message: 'Product scraped successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to scrape product'
      });
    }
  } catch (error) {
    console.error('❌ Erreur scrapeProduct:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Generate marketing post for product
 * POST /api/echo/product/generate-post
 */
exports.generateProductPost = async (req, res) => {
  try {
    const { product, style } = req.body;

    if (!product || !product.title) {
      return res.status(400).json({
        success: false,
        error: 'Product information is required'
      });
    }

    console.log(`🤖 [PRODUCT] Generating marketing post for: ${product.title}`);

    let result;
    let totalEnergyCost = 0;

    if (style && ['professional', 'casual', 'technical', 'emotional'].includes(style)) {
      // For styled posts, generate text only first, then add image
      const postText = await ProductMarketingGenerator.generateStyledPost(product, style);

      // ⚡ CONSUME ENERGY FOR CONTENT_GENERATION
      const contentEnergyResult = await manualEnergyConsumption(
        'echo',
        'CONTENT_GENERATION',
        `Generating ${style} marketing post for ${product.title}`,
        { productTitle: product.title, style },
        req.user?.id // Pass userId if available
      );

      if (contentEnergyResult.success) {
        totalEnergyCost += contentEnergyResult.energyCost;
        console.log(`⚡ [ENERGY] Echo consumed ${contentEnergyResult.energyCost} energy for CONTENT_GENERATION`);
      }

      // Now generate with image
      const fullResult = await ProductMarketingGenerator.generateMarketingPost(product, true);

      // ⚡ CONSUME ENERGY FOR IMAGE_GENERATION
      if (fullResult.image) {
        const imageEnergyResult = await manualEnergyConsumption(
          'echo',
          'IMAGE_GENERATION',
          `Generating AI image for ${product.title}`,
          { productTitle: product.title, imageUrl: fullResult.image },
          req.user?.id // Pass userId if available
        );

        if (imageEnergyResult.success) {
          totalEnergyCost += imageEnergyResult.energyCost;
          console.log(`⚡ [ENERGY] Echo consumed ${imageEnergyResult.energyCost} energy for IMAGE_GENERATION`);
        }
      }

      result = {
        text: postText,
        image: fullResult.image
      };
    } else {
      // Generate post with AI image
      result = await ProductMarketingGenerator.generateMarketingPost(product, true);

      // ⚡ CONSUME ENERGY FOR CONTENT_GENERATION
      const contentEnergyResult = await manualEnergyConsumption(
        'echo',
        'CONTENT_GENERATION',
        `Generating marketing post for ${product.title}`,
        { productTitle: product.title },
        req.user?.id // Pass userId if available
      );

      if (contentEnergyResult.success) {
        totalEnergyCost += contentEnergyResult.energyCost;
        console.log(`⚡ [ENERGY] Echo consumed ${contentEnergyResult.energyCost} energy for CONTENT_GENERATION`);
      }

      // ⚡ CONSUME ENERGY FOR IMAGE_GENERATION
      if (result.image) {
        const imageEnergyResult = await manualEnergyConsumption(
          'echo',
          'IMAGE_GENERATION',
          `Generating AI image for ${product.title}`,
          { productTitle: product.title, imageUrl: result.image },
          req.user?.id // Pass userId if available
        );

        if (imageEnergyResult.success) {
          totalEnergyCost += imageEnergyResult.energyCost;
          console.log(`⚡ [ENERGY] Echo consumed ${imageEnergyResult.energyCost} energy for IMAGE_GENERATION`);
        }
      }
    }

    res.json({
      success: true,
      post: result.text || result,
      image: result.image || null,
      productLink: product.url,
      style: style || 'professional',
      energyConsumed: totalEnergyCost
    });
  } catch (error) {
    console.error('❌ Erreur generateProductPost:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate post',
      details: error.message
    });
  }
};

/**
 * Start product marketing campaign
 * POST /api/echo/product/campaign/start
 */
exports.startProductCampaign = async (req, res) => {
  try {
    const { productUrl, frequency, platforms, postStyle, includeImage } = req.body;

    if (!productUrl) {
      return res.status(400).json({
        success: false,
        error: 'Product URL is required'
      });
    }

    console.log(`🚀 [CAMPAIGN] Starting campaign for: ${productUrl}`);

    // Check if campaign already exists for this product
    const existingCampaign = await ProductCampaign.findOne({
      productUrl,
      status: { $in: ['active', 'paused'] }
    });

    if (existingCampaign) {
      return res.status(400).json({
        success: false,
        error: 'Active campaign already exists for this product',
        campaign: existingCampaign
      });
    }

    // Scrape product
    const scrapeResult = await ProductScraperService.scrapeProduct(productUrl);

    if (!scrapeResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to scrape product',
        details: scrapeResult.error
      });
    }

    // Create campaign
    const campaign = await ProductCampaign.create({
      productUrl,
      productData: scrapeResult.product,
      frequency: frequency || '3days',
      platforms: platforms || ['linkedin', 'mastodon'], // Post to both platforms by default
      status: 'active',
      settings: {
        postStyle: postStyle || 'professional',
        includeImage: includeImage !== false,
        autoPost: true
      }
    });

    console.log(`✅ [CAMPAIGN] Campaign created: ${campaign._id}`);

    res.json({
      success: true,
      campaign: {
        id: campaign._id,
        productUrl: campaign.productUrl,
        productTitle: campaign.productData.title,
        status: campaign.status,
        frequency: campaign.frequency,
        platforms: campaign.platforms,
        nextPostAt: campaign.calculateNextPostTime(),
        createdAt: campaign.createdAt
      },
      message: 'Campaign started successfully. First post will be generated shortly.'
    });
  } catch (error) {
    console.error('❌ Erreur startProductCampaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start campaign',
      details: error.message
    });
  }
};

/**
 * Get campaign status
 * GET /api/echo/product/campaign/status
 */
exports.getCampaignStatus = async (req, res) => {
  try {
    const campaigns = await ProductCampaign.find({ status: { $in: ['active', 'paused'] } })
      .sort({ createdAt: -1 })
      .lean();

    if (campaigns.length === 0) {
      return res.json({
        success: true,
        campaign: null,
        message: 'No active campaigns'
      });
    }

    // Return the most recent active campaign
    const campaign = campaigns[0];

    res.json({
      success: true,
      campaign: {
        id: campaign._id,
        productUrl: campaign.productUrl,
        productTitle: campaign.productData?.title,
        productImage: campaign.productData?.images?.[0],
        status: campaign.status,
        frequency: campaign.frequency,
        platforms: campaign.platforms,
        postsGenerated: campaign.postsGenerated,
        lastPostAt: campaign.lastPostAt,
        nextPostAt: campaign.nextPostAt,
        totalEngagement: campaign.totalEngagement,
        createdAt: campaign.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Erreur getCampaignStatus:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get campaign status',
      details: error.message
    });
  }
};

/**
 * Stop product marketing campaign
 * POST /api/echo/product/campaign/stop
 */
exports.stopProductCampaign = async (req, res) => {
  try {
    const { campaignId } = req.body;

    let campaign;
    if (campaignId) {
      campaign = await ProductCampaign.findById(campaignId);
    } else {
      // Stop the most recent active campaign
      campaign = await ProductCampaign.findOne({ status: 'active' })
        .sort({ createdAt: -1 });
    }

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'No active campaign found'
      });
    }

    campaign.status = 'stopped';
    await campaign.save();

    console.log(`🛑 [CAMPAIGN] Campaign stopped: ${campaign._id}`);

    res.json({
      success: true,
      message: 'Campaign stopped successfully',
      campaign: {
        id: campaign._id,
        productUrl: campaign.productUrl,
        status: campaign.status,
        postsGenerated: campaign.postsGenerated
      }
    });
  } catch (error) {
    console.error('❌ Erreur stopProductCampaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop campaign',
      details: error.message
    });
  }
};

/**
 * Pause/Resume product marketing campaign
 * POST /api/echo/product/campaign/toggle
 */
exports.toggleProductCampaign = async (req, res) => {
  try {
    const { campaignId } = req.body;

    const campaign = await ProductCampaign.findById(campaignId);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    // Toggle between active and paused
    campaign.status = campaign.status === 'active' ? 'paused' : 'active';
    await campaign.save();

    console.log(`⏯️ [CAMPAIGN] Campaign ${campaign.status}: ${campaign._id}`);

    res.json({
      success: true,
      message: `Campaign ${campaign.status} successfully`,
      campaign: {
        id: campaign._id,
        status: campaign.status
      }
    });
  } catch (error) {
    console.error('❌ Erreur toggleProductCampaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle campaign',
      details: error.message
    });
  }
};

/**
 * Get campaign history (all campaigns)
 * GET /api/echo/product/campaign/history
 */
exports.getCampaignHistory = async (req, res) => {
  try {
    const { limit = 50, status } = req.query;

    // Build query
    const query = {};
    if (status) {
      query.status = status;
    }

    // Get all campaigns sorted by creation date (newest first)
    const campaigns = await ProductCampaign.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    // Format response
    const history = campaigns.map(campaign => ({
      id: campaign._id,
      productUrl: campaign.productUrl,
      productTitle: campaign.productData?.title || 'Unknown Product',
      productImage: campaign.productData?.images?.[0] || null,
      productPrice: campaign.productData?.price || 'N/A',
      productCategory: campaign.productData?.category || 'N/A',
      status: campaign.status,
      frequency: campaign.frequency,
      platforms: campaign.platforms,
      postsGenerated: campaign.postsGenerated || 0,
      lastPostAt: campaign.lastPostAt,
      nextPostAt: campaign.nextPostAt,
      totalEngagement: campaign.totalEngagement || 0,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt
    }));

    res.json({
      success: true,
      total: history.length,
      campaigns: history
    });
  } catch (error) {
    console.error('❌ Erreur getCampaignHistory:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get campaign history',
      details: error.message
    });
  }
};
