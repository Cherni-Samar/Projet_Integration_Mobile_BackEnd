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

    // ── Mapping spécialité + hard skills par département ─────
    const DEPARTMENT_SKILLS = {
      Tech:      { specialite: 'Développement logiciel & IA', hardSkills: ['JavaScript/Node.js', 'React/React Native', 'Python', 'MongoDB'] },
      Design:    { specialite: 'Design UX/UI', hardSkills: ['Figma', 'Adobe XD', 'Prototypage'] },
      Marketing: { specialite: 'Marketing Digital', hardSkills: ['SEO/SEM', 'Google Analytics', 'Social Media Ads'] },
      RH:        { specialite: 'Ressources Humaines', hardSkills: ['Gestion des talents', 'Droit du travail'] },
      Finance:   { specialite: 'Finance & Comptabilité', hardSkills: ['Analyse financière', 'Excel avancé'] },
      Support:   { specialite: 'Support Client', hardSkills: ['CRM (Zendesk)', 'Ticketing'] },
    };

    const deptInfo = DEPARTMENT_SKILLS[department] || { specialite: department, hardSkills: ['Polyvalence'] };
    const jobDescription = `Poste en ${deptInfo.specialite}. Skills: ${deptInfo.hardSkills.join(', ')}.`;

    // ── 0. Créer une JobOffer en BDD ─────
    const JobOffer = require('../models/JobOffer');
    const jobOffer = await JobOffer.create({
      document_type: 'opening',
      title: `${deptInfo.specialite} — ${postes} poste(s)`,
      department: department,
      description: jobDescription,
      status: 'open',
    });

    // ── 1. Préparation du post ──────────────
    const publicBase = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const recruitmentFormUrl = `${publicBase}/form?department=${encodeURIComponent(department)}&job_offer_id=${jobOffer._id}`;

    const linkedinPostText = `The future of work is agentic. E-Team is scaling. 🚀\n\nOur AI-driven ecosystem is looking for a ${deptInfo.specialite} to join the team.\n\n📍 Role: ${deptInfo.specialite}\n🛠 Skills: ${deptInfo.hardSkills.join(', ')}\n\n📩 Apply here: ${recruitmentFormUrl}\n\n#AI #Innovation #Recrutement #ETeam`;

    // ── 2. Publication LinkedIn ──────────────────────────────
    const linkedinService = require('../services/linkedin.service');
    const publishResult = await linkedinService.post(linkedinPostText);

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
exports.getDocumentsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { confidentialityLevel } = req.query;

    const validCategories = ["Commercial", "Finance", "Juridique", "Marketing", "RH", "Technique"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Catégorie invalide. Catégories valides: ${validCategories.join(', ')}`,
      });
    }


    const result = await echoAgent.getDocumentsByCategory(category, confidentialityLevel);

    res.json(result);
  } catch (error) {
    console.error("❌ Erreur route /documents/:category:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

// ─────────────────────────────────────────────
exports.getDocumentContent = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!documentId) {
      return res.status(400).json({
        success: false,
        error: "L'ID du document est requis",
      });
    }


    const result = await echoAgent.getDocumentContent(documentId);

    res.json(result);
  } catch (error) {
    console.error("❌ Erreur route /document-content/:documentId:", error);
    res.status(500).json({
      success: false,
      error: "Erreur interne du serveur",
      details: error.message,
    });
  }
};

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