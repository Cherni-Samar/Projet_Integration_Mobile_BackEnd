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
const SocialPost = require("../models/SocialPost");
const ProductScraperService = require("../services/echo/productScraper.service");
const ProductMarketingGenerator = require("../services/productMarketingGenerator.service");
const { manualEnergyConsumption } = require("../middleware/energyMiddleware");
const ActivityLogger = require("../services/activityLogger.service");
const { tick: echoAutonomyTick } = require("../services/echoLinkedInAutonomy");
const ProductCampaignScheduler = require("../services/productCampaignScheduler.service");
const User = require("../models/User");
const staffingService = require('../services/echo/staffing.service');
const campaignService = require('../services/echo/campaign.service');
const socialService = require('../services/echo/social.service');

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
// 🔔 REÇOIT L'ALERTE DE HÉRA → GÉNÈRE + PUBLIE OFFRE LINKEDIN + RÉPOND
// POST /api/echo/receive-staffing-alert
// Business logic delegated to services/echo/staffing.service.js
// ─────────────────────────────────────────────
exports.receiveHeraStaffingAlert = async (req, res) => {
  try {
    const { department, currentCount, maxCapacity, shortage, postedBy, emailId } = req.body;

    if (!department) {
      return res.status(400).json({ success: false, error: "Le champ 'department' est requis" });
    }

    console.log(`📩 [ECHO] Alerte staffing reçue pour le département : ${department}`);

    const result = await staffingService.processStaffingAlert({
      department,
      currentCount,
      maxCapacity,
      shortage,
      emailId,
      userId: req.body.userId,
    });

    return res.json({
      success: true,
      agent: 'Echo',
      message: "Publication effectuée et réponse enregistrée.",
      jobOfferId: result.jobOfferId,
      linkedinPost: result.linkedinPost,
    });

  } catch (error) {
    console.error('❌ [ECHO] Erreur receiveHeraStaffingAlert:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      ...(error.linkedinDetails && { details: error.linkedinDetails }),
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
    const ownerId = req.user?.id;

    if (!ownerId) {
      return res.status(401).json({
        success: false,
        error: 'Token manquant',
      });
    }

    const emails = await InboxEmail.find({
      ownerId,
    })
      .sort({ receivedAt: -1 })
      .lean();

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
const email = await InboxEmail.findOneAndUpdate(
  {
    _id: id,
    ownerId: req.user.id,
  },
  { isRead: true },
  { returnDocument: 'after' }
);
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
const deleted = await InboxEmail.findOneAndDelete({
  _id: id,
  ownerId: req.user.id,
});
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
    const result = socialService.getProductLinkConfig();
    res.json({
      success: true,
      data: {
        productLink: result.productLink,
        isConfigured: result.isConfigured,
        isValid: result.isValid
      },
      timestamp: result.timestamp
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

    const result = socialService.updateProductLinkConfig(productLink);

    res.json({
      success: true,
      message: 'Product link mis à jour avec succès',
      data: {
        productLink: result.productLink,
        isConfigured: result.isConfigured,
        isValid: result.isValid
      },
      timestamp: result.timestamp
    });
  } catch (error) {
    console.error('❌ Erreur updateProductLinkConfig:', error);

    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: error.message,
        ...(error.details && { details: error.details })
      });
    }

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
    const result = socialService.deleteProductLinkConfig();
    res.json({
      success: true,
      message: 'Product link configuration supprimée avec succès',
      data: {
        productLink: result.productLink,
        isConfigured: result.isConfigured,
        isValid: result.isValid
      },
      timestamp: result.timestamp
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
    const data = await socialService.getMobileConfig();
    res.json({
      success: true,
      data,
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

    const result = socialService.updateMobileProductLink(productLink);

    res.json({
      success: true,
      message: 'Product link updated successfully',
      data: {
        productLink: result.productLink,
        isConfigured: result.isConfigured,
        isValid: result.isValid,
        status: result.status
      }
    });
  } catch (error) {
    console.error('❌ Erreur updateMobileProductLink:', error);

    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

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
    
    // Force post generation
    await echoAutonomyTick(true);
    
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
    const data = await socialService.getMobileDashboard();
    res.json({
      success: true,
      data
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
    const data = await socialService.getPostsMetrics();
    res.json({
      success: true,
      data,
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

    const campaign = await campaignService.startProductCampaign({
      productUrl,
      frequency,
      platforms,
      postStyle,
      includeImage,
    });

    res.json({
      success: true,
      campaign,
      message: 'Campaign started successfully. First post will be generated shortly.'
    });
  } catch (error) {
    console.error('❌ Erreur startProductCampaign:', error);

    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: error.message,
        campaign: error.campaign
      });
    }

    if (error.statusCode === 500 && error.scrapeError !== undefined) {
      return res.status(500).json({
        success: false,
        error: error.message,
        details: error.scrapeError
      });
    }

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
    const campaign = await campaignService.getCampaignStatus();

    if (!campaign) {
      return res.json({
        success: true,
        campaign: null,
        message: 'No active campaigns'
      });
    }

    res.json({
      success: true,
      campaign
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

    const campaign = await campaignService.stopProductCampaign(campaignId);

    res.json({
      success: true,
      message: 'Campaign stopped successfully',
      campaign
    });
  } catch (error) {
    console.error('❌ Erreur stopProductCampaign:', error);

    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

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

    const campaign = await campaignService.toggleProductCampaign(campaignId);

    res.json({
      success: true,
      message: `Campaign ${campaign.status} successfully`,
      campaign
    });
  } catch (error) {
    console.error('❌ Erreur toggleProductCampaign:', error);

    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

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

    const history = await campaignService.getCampaignHistory({ limit, status });

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

// ============================================================
// LINKEDIN ROUTES — moved from echoroutes.js (Phase 4H4)
// ============================================================

/**
 * Get LinkedIn OAuth authorization URL
 * GET /api/echo/linkedin/auth-url
 */
exports.getLinkedInAuthUrl = async (req, res) => {
  try {
    const authUrl = linkedinService.getAuthUrl();
    res.json({
      success: true,
      authUrl: authUrl,
      message: 'Ouvrez cette URL dans votre navigateur pour autoriser Echo à publier sur LinkedIn'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * LinkedIn OAuth callback — exchange code for access token
 * GET /api/echo/linkedin/callback
 */
exports.linkedInCallback = async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ success: false, error: `LinkedIn error: ${error}` });
  }

  if (!code) {
    return res.status(400).json({ success: false, error: 'Code manquant' });
  }

  try {
    const result = await linkedinService.getAccessToken(code);

    if (result.success) {
      res.json({
        success: true,
        message: 'Authentification LinkedIn réussie ! Echo peut maintenant publier automatiquement.',
        redirect: '/api/echo/sante'
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Post a recruitment announcement to LinkedIn
 * POST /api/echo/linkedin/recruitment
 */
exports.postLinkedInRecruitment = async (req, res) => {
  const { jobTitle, jobDescription, location, contractType } = req.body;

  try {
    const recruitmentPost = `
🚨 **RECRUTEMENT** 🚨

Nous recherchons un(e) ${jobTitle || 'nouveau talent'} pour rejoindre notre équipe !

📌 **Poste** : ${jobTitle || 'À définir'}
📍 **Lieu** : ${location || 'Télétravail / France'}
📄 **Type** : ${contractType || 'CDI / CDD'}
📝 **Description** : ${jobDescription || 'Description du poste à venir'}

✨ Ce que nous offrons :
- Environnement innovant
- Équipe dynamique
- Projets stimulants

📩 **Postulez ici** : ${process.env.RECRUITMENT_FORM_URL || 'http://localhost:3000/candidature'}

#Recrutement #Emploi #Carrière #Job
    `;

    const result = await linkedinService.post(recruitmentPost);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Force an immediate autonomous social media post
 * POST /api/echo/social/force-post
 */
exports.forcePost = async (req, res) => {
  try {
    // On passe 'true' pour forcer la publication même si les 3 jours ne sont pas passés
    await echoAutonomyTick(true);
    res.json({ success: true, message: '🚀 Publication forcée sur LinkedIn et Mastodon avec image !' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Manually trigger the product campaign scheduler check
 * POST /api/echo/product/campaign/trigger-now
 */
exports.triggerCampaignNow = async (req, res) => {
  try {
    await ProductCampaignScheduler.triggerNow();
    res.json({
      success: true,
      message: '🚀 Campaign check triggered manually. Check console for results.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
