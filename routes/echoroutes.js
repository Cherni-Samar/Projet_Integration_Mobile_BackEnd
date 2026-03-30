// =============================================================
//  ROUTES EXPRESS - Agent Echo
//  Ces routes exposent l'agent Echo via une API REST
// =============================================================

const express = require("express");
const router = express.Router();
const echoAgent = require("../agents/Echoagent");
const { analyserMessage, reinitialiserMemoire } = echoAgent;

console.log('echoAgent loaded:', echoAgent);

// ─────────────────────────────────────────────
//  POST /api/echo/analyser
//  Analyse un seul message
//
//  Body: { "message": "Bonjour, notre serveur est tombé en panne !" }
// ─────────────────────────────────────────────
router.post("/analyser", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  POST /api/echo/full-analysis
//  Analyse complète avec toutes les fonctionnalités
//
//  Body: { 
//    "message": "Message à analyser", 
//    "sender": "email@example.com",
//    "context": { "conversationHistory": ["msg1", "msg2"] }
//  }
// ─────────────────────────────────────────────
router.post("/full-analysis", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  POST /api/echo/auto-reply
//  Génère une réponse automatique
//
//  Body: { "message": "Message", "context": {} }
// ─────────────────────────────────────────────
router.post("/auto-reply", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  POST /api/echo/response-suggestions
//  Génère des suggestions de réponses multiples
//
//  Body: { 
//    "message": "Message à analyser", 
//    "sender": "email@example.com",
//    "context": {},
//    "analysis": {} 
//  }
// ─────────────────────────────────────────────
router.post("/response-suggestions", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  POST /api/echo/check-escalation
//  Vérifie si un message nécessite une escalade
//
//  Body: { "message": "Message", "sender": "email", "urgencyLevel": "medium" }
// ─────────────────────────────────────────────
router.post("/check-escalation", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  POST /api/echo/filter-noise
//  Filtre le bruit (notifications inutiles)
//
//  Body: { "message": "Message", "sender": "email" }
// ─────────────────────────────────────────────
router.post("/filter-noise", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  POST /api/echo/extract-tasks
//  Extrait les tâches depuis les discussions
//
//  Body: { "message": "Message", "conversationContext": ["msg1", "msg2"] }
// ─────────────────────────────────────────────
router.post("/extract-tasks", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  POST /api/echo/batch-advanced
//  Analyse avancée en lot avec LangChain
//
//  Body: { 
//    "messages": [
//      {"message": "msg1", "sender": "user1", "context": {}},
//      {"message": "msg2", "sender": "user2", "context": {}}
//    ],
//    "options": {
//      "includeFullAnalysis": true,
//      "maxConcurrency": 3
//    }
//  }
// ─────────────────────────────────────────────
router.post("/batch-advanced", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  POST /api/echo/batch
//  Analyse plusieurs messages en une seule fois (version simple)
//
//  Body: { "messages": ["msg1", "msg2", "msg3"] }
// ─────────────────────────────────────────────
router.post("/batch", async (req, res) => {
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

    // Analyser chaque message en parallèle
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
});

// Route pour qu'Echo envoie un email à Hera
router.post('/send-to-hera', async (req, res) => {
  const { subject, content, from } = req.body;
  
  try {
    // Appeler l'API Hera pour recevoir l'email
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
});

// ═══════════════════════════════════════════════════════════════
// 📄 DOCUMENT MANAGEMENT ROUTES
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
//  POST /api/echo/classify-document
//  Classifie un document texte
//
//  Body: { "content": "Contenu du document à classifier" }
// ─────────────────────────────────────────────
router.post("/classify-document", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  POST /api/echo/save-document
//  Sauvegarde un document classifié
//
//  Body: { 
//    "content": "Contenu du document",
//    "classification": { ... }
//  }
// ─────────────────────────────────────────────
router.post("/save-document", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  GET /api/echo/documents/:category
//  Récupère les documents par catégorie
//
//  Params: category (Commercial, Finance, etc.)
//  Query: confidentialityLevel (optionnel)
// ─────────────────────────────────────────────
router.get("/documents/:category", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  GET /api/echo/document-content/:documentId
//  Récupère le contenu complet d'un document
//
//  Params: documentId
// ─────────────────────────────────────────────
router.get("/document-content/:documentId", async (req, res) => {
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
});

// ═══════════════════════════════════════════════════════════════
// 📋 TASK MANAGEMENT ROUTES
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
//  POST /api/echo/extract-tasks
//  Extrait et sauvegarde les tâches depuis un message
//
//  Body: { 
//    "message": "Contenu du message",
//    "sender": "email@example.com",
//    "emailId": "optional_email_id",
//    "subject": "optional_subject"
//  }
// ─────────────────────────────────────────────
router.post("/extract-save-tasks", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  GET /api/echo/tasks
//  Récupère la liste des tâches
//
//  Query: status (optional), category (optional)
// ─────────────────────────────────────────────
router.get("/tasks", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  PATCH /api/echo/tasks/:taskId/status
//  Met à jour le statut d'une tâche
//
//  Params: taskId
//  Body: { "status": "completed" }
// ─────────────────────────────────────────────
router.patch("/tasks/:taskId/status", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  DELETE /api/echo/tasks/:taskId
//  Supprime une tâche
//
//  Params: taskId
// ─────────────────────────────────────────────
router.delete("/tasks/:taskId", async (req, res) => {
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
});

// ─────────────────────────────────────────────
//  DELETE /api/echo/memoire
//  Réinitialise la mémoire de l'agent (nouvelle session)
// ─────────────────────────────────────────────
router.delete("/memoire", async (req, res) => {
  try {
    const result = await reinitialiserMemoire();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
//  GET /api/echo/sante
//  Vérifie que l'agent Echo fonctionne correctement
// ─────────────────────────────────────────────
router.get("/sante", (req, res) => {
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
      "POST /analyser - Analyse basique avec LangChain",
      "POST /full-analysis - Analyse complète orchestrée",
      "POST /auto-reply - Réponse automatique",
      "POST /response-suggestions - Suggestions de réponses multiples",
      "POST /check-escalation - Vérification escalade",
      "POST /filter-noise - Filtrage bruit",
      "POST /extract-tasks - Extraction tâches",
      "POST /batch - Analyse en lot simple",
      "POST /batch-advanced - Analyse en lot avancée",
      "POST /classify-document - Classification de documents",
      "POST /save-document - Sauvegarde de documents",
      "GET /documents/:category - Documents par catégorie",
      "GET /document-content/:id - Contenu de document",
      "POST /extract-save-tasks - Extraction et sauvegarde de tâches",
      "GET /tasks - Liste des tâches",
      "PATCH /tasks/:id/status - Mise à jour statut tâche",
      "DELETE /tasks/:id - Suppression de tâche"
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
    version: "2.1.0",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;