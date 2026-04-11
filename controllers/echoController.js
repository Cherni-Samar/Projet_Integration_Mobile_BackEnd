// =============================================================
//  CONTROLLER - Agent Echo
// =============================================================

const mongoose = require("mongoose");
const echoAgent = require("../agents/Echoagent");
const InboxEmail = require("../models/InboxEmail");
const inboxStatsService = require("../services/inboxStatsService");
const autoReplyManager = require("../services/autoReplyManager");
const { emailToClient } = require("../utils/emailSerialize");
const { reinitialiserMemoire } = echoAgent;
const linkedinService = require("../services/linkedin.service");

console.log('echoAgent loaded:', echoAgent);

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
exports.receiveHeraStaffingAlert = async (req, res) => {
  try {
    const { department, currentCount, maxCapacity, shortage, postedBy } = req.body;

    if (!department) {
      return res.status(400).json({ success: false, error: "Le champ 'department' est requis" });
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📩 [ECHO] Alerte staffing reçue de HÉRA`);
    console.log(`   Département : ${department}`);
    console.log(`   Effectif    : ${currentCount} / ${maxCapacity}`);
    console.log(`   Manquants   : ${shortage || (maxCapacity - currentCount)}`);
    console.log(`${'═'.repeat(60)}\n`);

    const postes = shortage || (maxCapacity - currentCount);

    // ── Mapping spécialité + hard skills par département ─────
    const DEPARTMENT_SKILLS = {
      Tech:      { specialite: 'Développement logiciel & IA', hardSkills: ['JavaScript/Node.js', 'React/React Native', 'Python', 'MongoDB', 'DevOps/CI-CD', 'API REST'] },
      Design:    { specialite: 'Design UX/UI', hardSkills: ['Figma', 'Adobe XD', 'Prototypage', 'Design System', 'User Research', 'Responsive Design'] },
      Marketing: { specialite: 'Marketing Digital', hardSkills: ['SEO/SEM', 'Google Analytics', 'Social Media Ads', 'Content Marketing', 'Email Marketing', 'KPIs & Reporting'] },
      RH:        { specialite: 'Ressources Humaines', hardSkills: ['Gestion des talents', 'SIRH', 'Droit du travail', 'Recrutement', 'Formation', 'Gestion de la paie'] },
      Finance:   { specialite: 'Finance & Comptabilité', hardSkills: ['Comptabilité générale', 'Excel avancé', 'SAP/ERP', 'Analyse financière', 'Trésorerie', 'Fiscalité'] },
      Support:   { specialite: 'Support Client', hardSkills: ['CRM (Zendesk/Freshdesk)', 'Communication écrite', 'Résolution de problèmes', 'ITIL', 'Ticketing', 'Satisfaction client'] },
    };

    const deptInfo = DEPARTMENT_SKILLS[department] || { specialite: department, hardSkills: ['Polyvalence', 'Travail en équipe'] };
    const jobDescription = `Poste en ${deptInfo.specialite}. Compétences requises : ${deptInfo.hardSkills.join(', ')}.`;

    // ── 0. Créer une JobOffer en BDD (pré-remplie par Héra) ─────
    const JobOffer = require('../models/JobOffer');
    const jobOffer = await JobOffer.create({
      document_type: 'opening',
      title: `${deptInfo.specialite} — ${postes} poste(s)`,
      department: department,
      description: jobDescription,
      status: 'open',
    });
    console.log(`📋 [ECHO] JobOffer créée : ${jobOffer._id}`);

    // ── 1. Echo rédige le post LinkedIn via son IA ──────────────
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

    // ── 2. Echo publie sur LinkedIn ──────────────────────────────
    const linkedinService = require('../services/linkedin.service');
    const publishResult = await linkedinService.post(linkedinPostText);

    if (publishResult.success) {
      console.log(`✅ [ECHO] Post LinkedIn publié avec succès ! ID : ${publishResult.postId}`);
    } else {
      console.warn(`⚠️ [ECHO] Publication LinkedIn échouée :`, publishResult.error);
    }

    // ── 3. Enregistrer dans InboxEmail (trace de la communication Héra→Echo) ──
    try {
      await InboxEmail.create({
        sender: postedBy || 'hera@e-team.com',
        to: 'echo@e-team.com',
        subject: `[STAFFING] Recrutement ${department} — ${postes} poste(s) manquant(s)`,
        content: `Alerte reçue de Héra. JobOffer: ${jobOffer._id}. Post LinkedIn ${publishResult.success ? 'publié (ID: ' + publishResult.postId + ')' : 'ÉCHEC: ' + publishResult.error}.\n\n${linkedinPostText}`,
        receivedAt: new Date(),
        isRead: false,
        isUrgent: true,
        priority: 'high',
        category: 'recrutement',
        summary: `Recrutement ${department} — ${postes} poste(s). LinkedIn: ${publishResult.success ? '✅' : '❌'}`,
      });
    } catch (dbErr) {
      console.warn('⚠️ Trace InboxEmail non sauvegardée :', dbErr.message);
    }

    // ── 4. Réponse finale ────────────────────────────────────────
    return res.json({
      success: true,
      agent: 'Echo',
      message: publishResult.success
        ? `✅ Post de recrutement publié sur LinkedIn pour le département ${department}`
        : `⚠️ Post généré mais publication LinkedIn échouée`,
      linkedinPost: linkedinPostText,
      linkedinResult: publishResult,
      jobOfferId: jobOffer._id,
      formUrl: recruitmentFormUrl,
      department,
      shortage: postes,
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

    console.log(`💾 Sauvegarde de document classifié - Catégorie: ${classification.category}`);

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

    console.log(`📂 Récupération documents Echo - Catégorie: ${category}`);

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

    console.log(`📖 Récupération contenu document Echo: ${documentId}`);

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

    console.log(`📋 Extraction et sauvegarde tâches pour: ${message.substring(0, 50)}...`);

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

    console.log(`📋 Récupération tâches - Status: ${status}, Category: ${category}`);

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

    console.log(`📋 Mise à jour statut tâche: ${taskId} -> ${status}`);

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

    console.log(`📋 Suppression tâche: ${taskId}`);

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
      "📋 Gestion de tâches intelligente",
      "⏰ Suivi des échéances et priorités"
    ],
    endpoints: [
      "POST /analyser", "POST /full-analysis", "POST /auto-reply",
      "POST /response-suggestions", "POST /check-escalation", "POST /filter-noise",
      "POST /extract-tasks", "POST /batch", "POST /batch-advanced",
      "POST /classify-document", "POST /save-document",
      "GET /documents/:category", "GET /document-content/:id",
      "POST /extract-save-tasks", "GET /tasks",
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