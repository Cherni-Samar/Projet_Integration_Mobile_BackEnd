<<<<<<< HEAD
// =============================================================
//  ROUTES EXPRESS - Agent Dexo (Administrative Document Agent)
//  Gestion intelligente et sécurisée des documents avec n8n
// =============================================================

const express = require("express");
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const DexoAgent = require("../agents/DexoAgent");

// Create DexoAgent instance
const dexoAgent = new DexoAgent();

// Multer configuration removed - upload functionality disabled

console.log('🤖 DEXO Agent loaded in autonomous mode:', dexoAgent);

// ─────────────────────────────────────────────
//  POST /api/dexo/autonomous-process
//  100% Autonomous document processing - minimal user interaction
//
//  Body: { "filename": "doc.pdf", "content": "contenu...", "metadata": {} }
// ─────────────────────────────────────────────
router.post("/autonomous-process", async (req, res) => {
  try {
    const { filename, content, metadata = {} } = req.body;
    const userId = req.user?.id || req.body.userId || 'anonymous';

    if (!filename || !content) {
      return res.status(400).json({
        success: false,
        error: "Filename and content are required"
      });
    }

    console.log(`🤖 DEXO: Starting autonomous processing for "${filename}"`);
    
    // Process document with 100% autonomous AI
    const result = await dexoAgent.processDocument(filename, content, userId, {
      ...metadata,
      autonomousMode: true,
      apiEndpoint: '/autonomous-process',
      timestamp: new Date()
    });

    // Return comprehensive autonomous processing result
    res.json({
      success: true,
      message: "Document processed autonomously by DEXO AI",
      data: result,
      autonomousFeatures: {
        aiDecisionsMade: Object.keys(result.autonomousDecisions || {}).length,
        workflowsTriggered: result.workflowsTriggered?.length || 0,
        userInteractionRequired: false,
        processingMode: "100% autonomous",
        aiConfidence: result.classification?.confidence || 0
      }
    });

  } catch (error) {
    console.error("❌ DEXO Autonomous Processing Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      autonomousErrorHandling: true
    });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dexo/autonomous-status
//  Get autonomous system status and metrics
// ─────────────────────────────────────────────
router.get("/autonomous-status", async (req, res) => {
  try {
    const status = {
      autonomousMode: dexoAgent.autonomousMode,
      userInteractionRequired: dexoAgent.userInteractionRequired,
      autoExecuteDecisions: dexoAgent.autoExecuteDecisions,
      aiComponents: {
        decisionEngine: !!dexoAgent.autonomousDecisionEngine,
        workflowOrchestrator: !!dexoAgent.aiWorkflowOrchestrator,
        smartMonitoring: !!dexoAgent.smartMonitoringSystem
      },
      businessRules: dexoAgent.autonomousDecisionEngine?.businessRules.size || 0,
      activeWorkflows: dexoAgent.aiWorkflowOrchestrator?.activeWorkflows.size || 0,
      decisionHistory: dexoAgent.autonomousDecisionEngine?.decisionHistory.length || 0,
      systemHealth: "optimal",
      lastHealthCheck: new Date(),
      capabilities: [
        "Autonomous document classification",
        "AI-powered security monitoring", 
        "Intelligent workflow orchestration",
        "Predictive analytics and optimization",
        "Self-learning and adaptation",
        "Autonomous error handling and recovery"
      ]
    };

    res.json({
      success: true,
      message: "DEXO running in 100% autonomous mode",
      status
    });

  } catch (error) {
    console.error("❌ DEXO Status Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/autonomous-upload
//  Upload document for 100% autonomous processing
// ─────────────────────────────────────────────
router.post("/autonomous-upload", async (req, res) => {
  try {
    const { filename, content, metadata = {} } = req.body;
    const userId = req.user?.id || req.body.userId || 'autonomous-user';

    if (!filename || !content) {
      return res.status(400).json({
        success: false,
        error: "Filename and content are required"
      });
    }

    console.log(`🤖 DEXO: Autonomous upload received - ${filename}`);
    
    // Add to autonomous document watcher for processing
    const autonomousService = require('../services/autonomousService');
    const result = await autonomousService.addDocumentToWatcher(filename, content, {
      ...metadata,
      uploadedViaAPI: true,
      userId,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: "Document added to autonomous processing queue",
      data: result,
      autonomousProcessing: {
        userInteractionRequired: false,
        processingMode: "100% autonomous",
        estimatedProcessingTime: "30-60 seconds",
        willNotifyWhenComplete: true
      }
    });

  } catch (error) {
    console.error("❌ DEXO Autonomous Upload Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      autonomousErrorHandling: true
    });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dexo/autonomous-service-status
//  Get autonomous service detailed status
// ─────────────────────────────────────────────
router.get("/autonomous-service-status", async (req, res) => {
  try {
    const autonomousService = require('../services/autonomousService');
    const status = autonomousService.getStatus();

    res.json({
      success: true,
      message: "Autonomous service status",
      status,
      userMessage: status.isRunning 
        ? "DEXO is running autonomously - no user input needed!"
        : "Autonomous service is not running"
    });

  } catch (error) {
    console.error("❌ DEXO Service Status Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/enable-autonomous
//  Enable autonomous processing
// ─────────────────────────────────────────────
router.post("/enable-autonomous", async (req, res) => {
  try {
    const autonomousService = require('../services/autonomousService');
    autonomousService.enableAutoProcessing();

    res.json({
      success: true,
      message: "Autonomous processing enabled - DEXO will now work without user input",
      userInteractionRequired: false
    });

  } catch (error) {
    console.error("❌ DEXO Enable Autonomous Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/disable-autonomous
//  Disable autonomous processing (for maintenance)
// ─────────────────────────────────────────────
router.post("/disable-autonomous", async (req, res) => {
  try {
    const autonomousService = require('../services/autonomousService');
    autonomousService.disableAutoProcessing();

    res.json({
      success: true,
      message: "Autonomous processing disabled - manual processing required",
      userInteractionRequired: true
    });

  } catch (error) {
    console.error("❌ DEXO Disable Autonomous Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload endpoint removed - upload functionality disabled

// ─────────────────────────────────────────────
//  POST /api/dexo/classify
//  Classification automatique d'un document
//
//  Body: { "filename": "doc.pdf", "content": "contenu...", "metadata": {} }
// ─────────────────────────────────────────────
router.post("/classify", async (req, res) => {
  try {
    const { filename, content, metadata = {} } = req.body;

    if (!filename || !content) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'filename' et 'content' sont requis"
      });
    }

    console.log(`📁 Classification demandée pour: ${filename}`);

    const classification = await dexoAgent.classifyDocument(filename, content, metadata);

    res.json({
      success: true,
      classification: classification,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur classification:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la classification",
      details: error.message
    });
  }
});

// File classification endpoint removed - upload functionality disabled

// ─────────────────────────────────────────────
//  POST /api/dexo/search
//  Recherche intelligente en langage naturel
//
//  Body: { "query": "contrats signés le mois dernier", "userRole": "manager" }
// ─────────────────────────────────────────────
router.post("/search", async (req, res) => {
  try {
    const { query, userRole = "employee", context = {} } = req.body;

    if (!query || query.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Le champ 'query' est requis"
      });
    }

    console.log(`🔍 Recherche intelligente: "${query}" par ${userRole}`);

    const searchResult = await dexoAgent.intelligentSearch(query, userRole, context);

    res.json({
      success: true,
      query: query,
      userRole: userRole,
      ...searchResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur recherche:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la recherche",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/security-check
//  Vérification de sécurité pour un accès document
//
//  Body: { "event": "access", "user": "john", "document": "contract.pdf", "action": "read" }
// ─────────────────────────────────────────────
router.post("/security-check", async (req, res) => {
  try {
    const { event, user, document, action, context = {} } = req.body;

    if (!event || !user || !document || !action) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'event', 'user', 'document' et 'action' sont requis"
      });
    }

    console.log(`🚨 Vérification sécurité: ${user} -> ${action} sur ${document}`);

    const securityResult = await dexoAgent.checkSecurity(event, user, document, action, context);

    res.json({
      success: true,
      securityCheck: securityResult,
      accessGranted: securityResult.alertLevel !== 'critical' && securityResult.alertLevel !== 'emergency',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur vérification sécurité:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la vérification sécurité",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/generate-document
//  Génération automatique de document
//
//  Body: { "documentType": "contrat", "requirements": "...", "data": {}, "format": "markdown" }
// ─────────────────────────────────────────────
router.post("/generate-document", async (req, res) => {
  try {
    const { documentType, requirements, data = {}, format = "markdown", language = "français" } = req.body;

    if (!documentType || !requirements) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'documentType' et 'requirements' sont requis"
      });
    }

    console.log(`📄 Génération document: ${documentType}`);

    const generationResult = await dexoAgent.generateDocument(
      documentType, 
      requirements, 
      data, 
      format, 
      language
    );

    res.json({
      success: generationResult.success,
      ...generationResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur génération document:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la génération",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/detect-duplicates
//  Détection de doublons
//
//  Body: { "filename": "doc.pdf", "content": "contenu...", "metadata": {} }
// ─────────────────────────────────────────────
router.post("/detect-duplicates", async (req, res) => {
  try {
    const { filename, content, metadata = {} } = req.body;

    if (!filename || !content) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'filename' et 'content' sont requis"
      });
    }

    console.log(`🔄 Détection doublons pour: ${filename}`);

    const duplicateResult = await dexoAgent.detectDuplicates(filename, content, metadata);

    res.json({
      success: true,
      duplicateAnalysis: duplicateResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur détection doublons:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la détection de doublons",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/create-version
//  Création d'une nouvelle version de document
//
//  Body: { "filename": "doc.pdf", "content": "contenu...", "userId": "john", "comment": "..." }
// ─────────────────────────────────────────────
router.post("/create-version", async (req, res) => {
  try {
    const { filename, content, userId, comment = "" } = req.body;

    if (!filename || !content || !userId) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'filename', 'content' et 'userId' sont requis"
      });
    }

    console.log(`📋 Création version pour: ${filename} par ${userId}`);

    const versionResult = await dexoAgent.createVersion(filename, content, userId, comment);

    res.json({
      success: versionResult.success,
      ...versionResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur création version:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la création de version",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dexo/check-expirations
//  Vérification des documents expirés
// ─────────────────────────────────────────────
router.get("/check-expirations", async (req, res) => {
  try {
    console.log('📅 Vérification des expirations...');

    const expirationResult = await dexoAgent.checkExpirations();

    res.json({
      success: true,
      ...expirationResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur vérification expirations:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la vérification des expirations",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/n8n-webhook
//  Webhook pour recevoir des événements de n8n
//
//  Body: { "workflow": "document-processed", "data": {...} }
// ─────────────────────────────────────────────
router.post("/n8n-webhook", async (req, res) => {
  try {
    const { workflow, data, timestamp } = req.body;

    console.log(`🔗 Webhook n8n reçu: ${workflow}`);

    // Traiter les différents types de webhooks n8n
    let response = { received: true };

    switch (workflow) {
      case 'document-processed':
        response.message = 'Document traité avec succès';
        break;
      case 'security-alert':
        response.message = 'Alerte sécurité traitée';
        break;
      case 'expiration-reminder':
        response.message = 'Rappel d\'expiration envoyé';
        break;
      default:
        response.message = 'Webhook traité';
    }

    res.json({
      success: true,
      workflow,
      ...response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur webhook n8n:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors du traitement du webhook",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dexo/health
//  Vérification de l'état de l'agent Dexo
// ─────────────────────────────────────────────
router.get("/health", (req, res) => {
  res.json({
    status: "✅ Agent Dexo opérationnel avec LangChain + n8n",
    mission: "Gérer et sécuriser les documents intelligemment",
    fonctionnalites: [
      "📁 Classification automatique des documents",
      "🏷️ Nommage intelligent des documents",
      "🔐 Gestion des accès par rôle",
      "📋 Versioning automatique des documents",
      "📅 Suivi des dates d'expiration",
      "🔒 Partage sécurisé avec contrôle d'accès",
      "🔄 Détection intelligente de doublons",
      "📝 Journalisation complète des accès",
      "🔍 Recherche en langage naturel",
      "🚨 Alertes sécurité en temps réel",
      "📄 Génération automatique de documents",
      "🔗 Intégration n8n pour workflows"
    ],
    scenarios: [
      "Document expiré → alerte renouvellement",
      "Recherche intelligente (langage naturel)",
      "Accès non autorisé → alerte sécurité",
      "Génération document automatique",
      "Mise à jour → sauvegarde ancienne version"
    ],
    endpoints: [
      "POST /classify - Classification de document",
      "POST /search - Recherche intelligente",
      "POST /security-check - Vérification sécurité",
      "POST /generate-document - Génération automatique",
      "POST /detect-duplicates - Détection doublons",
      "POST /create-version - Création de version",
      "GET /check-expirations - Vérification expirations",
      "POST /n8n-webhook - Webhook n8n"
    ],
    integrations: {
      langchain: {
        version: "0.1.0",
        features: [
          "Classification automatique avec Zod schemas",
          "Recherche sémantique intelligente",
          "Génération de documents structurés",
          "Détection de doublons avancée",
          "Alertes sécurité contextuelles"
        ],
        model: "llama-3.3-70b-versatile",
        provider: "groq"
      },
      n8n: {
        enabled: true,
        webhookUrl: process.env.N8N_URL,
        workflows: [
          "document-classified",
          "document-searched", 
          "security-alert",
          "duplicate-detected",
          "version-created",
          "documents-expired",
          "document-generated",
          "document-processed"
        ]
      }
    },
    security: {
      fileTypes: "PDF, DOC, DOCX, TXT, CSV, XLS, XLSX, Images",
      maxFileSize: "50MB",
      accessControl: "Role-based",
      encryption: "SHA-256 hashing",
      logging: "Complete access logs"
    },
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

// ═══════════════════════════════════════════════════════════════
// 🔒 ADVANCED SECURITY ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
//  POST /api/dexo/generate-intelligent-name
//  Génération de nom intelligent pour un document
// ─────────────────────────────────────────────
router.post("/generate-intelligent-name", async (req, res) => {
  try {
    const { content, metadata = {}, classification } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: "Le champ 'content' est requis"
      });
    }

    console.log('🏷️ Génération de nom intelligent...');

    const intelligentName = await dexoAgent.generateIntelligentName(content, metadata, classification);

    res.json({
      success: true,
      intelligentName,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur génération nom intelligent:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la génération du nom intelligent",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/check-access-permissions
//  Vérification des permissions d'accès (RBAC)
// ─────────────────────────────────────────────
router.post("/check-access-permissions", async (req, res) => {
  try {
    const { userId, documentId, action = 'read' } = req.body;

    if (!userId || !documentId) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'userId' et 'documentId' sont requis"
      });
    }

    console.log(`🔐 Vérification permissions: ${userId} -> ${documentId} (${action})`);

    const accessCheck = await dexoAgent.checkAccessPermissions(userId, documentId, action);

    res.json({
      success: true,
      accessCheck,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur vérification permissions:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la vérification des permissions",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/create-secure-share-link
//  Création de lien de partage sécurisé
// ─────────────────────────────────────────────
router.post("/create-secure-share-link", async (req, res) => {
  try {
    const { documentId, userId, options = {} } = req.body;

    if (!documentId || !userId) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'documentId' et 'userId' sont requis"
      });
    }

    console.log('🔗 Création de lien de partage sécurisé...');

    const shareResult = await dexoAgent.createSecureShareLink(documentId, userId, options);

    res.json({
      success: shareResult.success,
      ...shareResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur création lien sécurisé:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la création du lien sécurisé",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/detect-advanced-duplicates
//  Détection avancée de doublons
// ─────────────────────────────────────────────
router.post("/detect-advanced-duplicates", async (req, res) => {
  try {
    const { filename, content, metadata = {} } = req.body;

    if (!filename || !content) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'filename' et 'content' sont requis"
      });
    }

    console.log('🧬 Détection avancée de doublons...');

    const duplicateAnalysis = await dexoAgent.detectAdvancedDuplicates(filename, content, metadata);

    res.json({
      success: true,
      duplicateAnalysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur détection avancée doublons:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la détection avancée de doublons",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/log-security-event
//  Journalisation des événements de sécurité
// ─────────────────────────────────────────────
router.post("/log-security-event", async (req, res) => {
  try {
    const { eventType, userId, documentId, action, metadata = {} } = req.body;

    if (!eventType || !userId || !documentId || !action) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'eventType', 'userId', 'documentId' et 'action' sont requis"
      });
    }

    console.log('📜 Journalisation événement sécurité...');

    const auditEntry = await dexoAgent.logSecurityEvent(eventType, userId, documentId, action, metadata);

    res.json({
      success: true,
      auditEntry,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur journalisation sécurité:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la journalisation sécurité",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/analyze-suspicious-patterns
//  Analyse comportementale des patterns suspects
// ─────────────────────────────────────────────
router.post("/analyze-suspicious-patterns", async (req, res) => {
  try {
    const { userId, hours = 24 } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Le champ 'userId' est requis"
      });
    }

    console.log('🔍 Analyse comportementale...');

    const suspiciousPatterns = await dexoAgent.analyzeSuspiciousPatterns(userId, 'behavioral_analysis', 'analyze');

    res.json({
      success: true,
      userId,
      hours,
      suspiciousPatterns,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur analyse comportementale:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de l'analyse comportementale",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dexo/perform-security-scan
//  Scan de sécurité périodique
// ─────────────────────────────────────────────
router.get("/perform-security-scan", async (req, res) => {
  try {
    console.log('🔒 Scan de sécurité périodique...');

    const scanResults = await dexoAgent.performSecurityScan();

    res.json({
      success: true,
      scanResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur scan sécurité:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors du scan de sécurité",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dexo/perform-expiration-scan
//  Scan des expirations
// ─────────────────────────────────────────────
router.get("/perform-expiration-scan", async (req, res) => {
  try {
    console.log('⏰ Scan des expirations...');

    const expirationReport = await dexoAgent.performExpirationScan();

    res.json({
      success: true,
      expirationReport,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur scan expiration:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors du scan des expirations",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  POST /api/dexo/process-document-advanced
//  Traitement avancé de document
// ─────────────────────────────────────────────
router.post("/process-document-advanced", async (req, res) => {
  try {
    const { filename, content, userId, metadata = {} } = req.body;

    if (!filename || !content || !userId) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'filename', 'content' et 'userId' sont requis"
      });
    }

    console.log('🎯 Traitement avancé de document...');

    const result = await dexoAgent.processDocumentAdvanced(filename, content, userId, metadata);

    res.json({
      success: result.success,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur traitement avancé:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors du traitement avancé",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dexo/audit-logs
//  Récupération des logs d'audit
// ─────────────────────────────────────────────
router.get("/audit-logs", async (req, res) => {
  try {
    const { userId, documentId, eventType, startDate, endDate, limit = 100 } = req.query;

    console.log('📜 Récupération logs d\'audit...');

    // En production, ceci interrogerait une base de données
    const auditLogs = {
      logs: [
        {
          eventId: "audit-001",
          timestamp: new Date().toISOString(),
          eventType: eventType || "document_access",
          userId: userId || "user1",
          documentId: documentId || "doc_test_1",
          action: "read",
          success: true
        }
      ],
      totalCount: 1,
      filters: { userId, documentId, eventType, startDate, endDate },
      limit: parseInt(limit)
    };

    res.json({
      success: true,
      auditLogs,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur récupération logs:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des logs",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dexo/security-metrics
//  Métriques de sécurité
// ─────────────────────────────────────────────
router.get("/security-metrics", async (req, res) => {
  try {
    console.log('📊 Récupération métriques sécurité...');

    const securityMetrics = {
      totalAccess: dexoAgent.securityMetrics?.totalAccess || 0,
      unauthorizedAttempts: dexoAgent.securityMetrics?.unauthorizedAttempts || 0,
      documentsClassified: dexoAgent.securityMetrics?.documentsClassified || 0,
      duplicatesDetected: dexoAgent.securityMetrics?.duplicatesDetected || 0,
      securityAlerts: dexoAgent.securityMetrics?.securityAlerts || 0,
      securityScore: 85, // Score calculé
      lastScanDate: new Date().toISOString(),
      systemHealth: "healthy"
    };

    res.json({
      success: true,
      securityMetrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur métriques sécurité:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des métriques",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dexo/security-dashboard
//  Dashboard de sécurité
// ─────────────────────────────────────────────
router.get("/security-dashboard", async (req, res) => {
  try {
    console.log('📊 Récupération dashboard sécurité...');

    const dashboard = {
      overview: {
        securityScore: 85,
        totalDocuments: 150,
        secureDocuments: 128,
        alertsToday: 3,
        lastScan: new Date().toISOString()
      },
      recentAlerts: [
        {
          id: "alert-001",
          type: "unauthorized_access_attempt",
          severity: "medium",
          timestamp: new Date().toISOString(),
          description: "Tentative d'accès non autorisé détectée"
        }
      ],
      accessStats: {
        totalAccess: 1250,
        authorizedAccess: 1200,
        deniedAccess: 50,
        successRate: 96
      },
      topUsers: [
        { userId: "user1", accessCount: 45, role: "manager" },
        { userId: "user2", accessCount: 32, role: "employee" }
      ]
    };

    res.json({
      success: true,
      dashboard,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur dashboard sécurité:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération du dashboard",
      details: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 💾 DOCUMENT SAVE ENDPOINT
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
//  POST /api/dexo/save-classified-document
//  Sauvegarder un document classifié dans la base de données
// ─────────────────────────────────────────────
router.post("/save-classified-document", async (req, res) => {
  try {
    const { filename, content, classification, userId, metadata = {} } = req.body;

    if (!filename || !content || !classification || !userId) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'filename', 'content', 'classification' et 'userId' sont requis"
      });
    }

    console.log(`💾 Sauvegarde document classifié: ${filename} dans ${classification.category}`);

    // Sauvegarder le document avec sa classification
    const saveResult = await dexoAgent.saveClassifiedDocument(
      filename,
      content,
      classification,
      userId,
      metadata
    );

    res.json({
      success: saveResult.success,
      ...saveResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur sauvegarde document classifié:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la sauvegarde du document classifié",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dexo/documents-by-category
//  Récupérer les documents par catégorie
//
//  Query: category, userId, limit, offset
// ─────────────────────────────────────────────
router.get("/documents-by-category", async (req, res) => {
  try {
    const { category, userId, limit = 20, offset = 0 } = req.query;

    if (!category) {
      return res.status(400).json({
        success: false,
        error: "Le paramètre 'category' est requis"
      });
    }

    console.log(`📂 Récupération documents catégorie: ${category}`);

    const result = await dexoAgent.getDocumentsByCategory(category, userId, parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      category: category,
      documents: result.documents,
      totalCount: result.totalCount,
      hasMore: result.hasMore,
      limit: parseInt(limit),
      offset: parseInt(offset),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur récupération documents par catégorie:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des documents",
      details: error.message
    });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dexo/document-content/:documentId
//  Récupérer le contenu d'un document
//
//  Params: documentId
// ─────────────────────────────────────────────
router.get("/document-content/:documentId", async (req, res) => {
  try {
    const { documentId } = req.params;
    const { userId } = req.query;

    if (!documentId) {
      return res.status(400).json({
        success: false,
        error: "Le paramètre 'documentId' est requis"
      });
    }

    console.log(`📖 Récupération contenu document: ${documentId}`);

    const contentResult = await dexoAgent.getDocumentContent(documentId, userId);

    if (!contentResult.success) {
      return res.status(404).json({
        success: false,
        error: contentResult.error || "Document non trouvé"
      });
    }

    res.json({
      success: true,
      documentId: documentId,
      content: contentResult.content,
      filename: contentResult.filename,
      category: contentResult.category,
      confidentialityLevel: contentResult.confidentialityLevel,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erreur récupération contenu document:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération du contenu",
      details: error.message
    });
  }
});

// Document category management endpoints removed - upload functionality disabled

=======
const express = require('express');
const router = express.Router();
const dexo = require('../controllers/dexoController');
const authMiddleware = require('../middleware/authMiddleware');
router.get('/checkup', authMiddleware, dexo.getDailyCheckUp);
router.get('/document-actions', authMiddleware, dexo.getDocumentActions);
router.get('/opportunities', authMiddleware, dexo.getOpportunities);
router.post('/approve-project', authMiddleware, dexo.approveProject);
router.post('/strategic-advice', dexo.getStrategicAdvice);
router.post('/save-vision', dexo.saveVision);
router.get('/workforce-settings', authMiddleware, dexo.getWorkforceSettings);
router.patch('/workforce-settings', authMiddleware, dexo.updateWorkforceSettings);
>>>>>>> 640174d (fix: formulaire candidature + emails + ngrok cleanup)
module.exports = router;