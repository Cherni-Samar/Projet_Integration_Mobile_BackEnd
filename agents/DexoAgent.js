const { ChatGroq } = require("@langchain/groq");
const { PromptTemplate } = require("@langchain/core/prompts");
const { RunnableSequence } = require("@langchain/core/runnables");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { z } = require("zod");
const { StructuredOutputParser } = require("@langchain/core/output_parsers");
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const Document = require('../models/Document');
const mongoose = require('mongoose');

class DexoAgent {
  constructor() {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
    });

    // Autonomous mode settings
    this.autonomousMode = true;
    this.userInteractionRequired = false;
    
    // Configuration n8n
    this.n8nUrl = process.env.N8N_URL || 'http://localhost:5678/webhook';
    
    // Répertoires de documents
    this.documentsPath = path.join(__dirname, '../documents');
    this.versionsPath = path.join(__dirname, '../documents/versions');
    
    // Configuration de sécurité
    this.securityConfig = {
      maxFileSize: 50 * 1024 * 1024, // 50MB
      allowedExtensions: ['.pdf', '.doc', '.docx', '.txt', '.md', '.xlsx', '.pptx'],
      quarantinePath: path.join(__dirname, '../documents/quarantine'),
      auditLogPath: path.join(__dirname, '../logs/audit.log')
    };

    // Taxonomie documentaire
    this.taxonomy = {
      departments: ['RH', 'Finance', 'Juridique', 'Technique', 'Marketing', 'Commercial'],
      documentTypes: ['contrat', 'facture', 'rapport', 'presentation', 'politique', 'procedure'],
      confidentialityLevels: {
        'public': { level: 0, color: '#4CAF50', roles: ['all'] },
        'interne': { level: 1, color: '#FF9800', roles: ['employee', 'manager', 'admin'] },
        'confidentiel': { level: 2, color: '#F44336', roles: ['manager', 'admin'] },
        'critique': { level: 3, color: '#9C27B0', roles: ['admin'] }
      }
    };

    // Cache pour les embeddings et recherches
    this.searchCache = new Map();
    this.embeddingsCache = new Map();
    
    console.log('🤖 DEXO: Initialized in autonomous mode - minimal user interaction required');

    // Initialize directories and security monitoring
    this.initializeDirectories();
    this.initializeSecurityMonitoring();
    this.initializeChains();
  }

  async initializeDirectories() {
    try {
      await fs.mkdir(this.documentsPath, { recursive: true });
      await fs.mkdir(this.versionsPath, { recursive: true });
      await fs.mkdir(path.join(this.documentsPath, 'classified'), { recursive: true });
      await fs.mkdir(path.join(this.documentsPath, 'temp'), { recursive: true });
      await fs.mkdir(this.securityConfig.quarantinePath, { recursive: true });
      await fs.mkdir(path.dirname(this.securityConfig.auditLogPath), { recursive: true });
      
      // Créer les dossiers par département et niveau de confidentialité
      for (const dept of this.taxonomy.departments) {
        for (const level of Object.keys(this.taxonomy.confidentialityLevels)) {
          await fs.mkdir(path.join(this.documentsPath, 'classified', dept, level), { recursive: true });
        }
      }
      
      console.log('✅ Structure de répertoires initialisée');
    } catch (error) {
      console.error('❌ Erreur création répertoires:', error.message);
    }
  }

  async initializeSecurityMonitoring() {
    // Initialiser le monitoring de sécurité
    this.securityMetrics = {
      totalAccess: 0,
      unauthorizedAttempts: 0,
      documentsClassified: 0,
      duplicatesDetected: 0,
      securityAlerts: 0
    };

    // Note: Le monitoring périodique peut être activé en production
    // setInterval(() => {
    //   this.performSecurityScan();
    // }, 300000); // Toutes les 5 minutes

    console.log('🔒 Monitoring de sécurité initialisé');
  }

  initializeChains() {
    // ═══════════════════════════════════════════════════════════════
    // 📁 DOCUMENT CLASSIFICATION CHAIN
    // ═══════════════════════════════════════════════════════════════
    
    const classificationSchema = z.object({
      category: z.enum([
        "contrats", "factures", "rapports", "presentations", 
        "juridique", "rh", "technique", "marketing", "finance", "autre"
      ]).describe("catégorie du document"),
      subcategory: z.string().describe("sous-catégorie spécifique"),
      confidentialityLevel: z.enum(["public", "interne", "confidentiel", "secret"]).describe("niveau de confidentialité"),
      suggestedName: z.string().describe("nom de fichier suggéré"),
      tags: z.array(z.string()).describe("mots-clés pour recherche"),
      expirationDate: z.string().nullable().describe("date d'expiration si applicable (YYYY-MM-DD)"),
      accessRoles: z.array(z.string()).describe("rôles autorisés à accéder"),
      priority: z.enum(["low", "medium", "high", "critical"]).describe("priorité du document"),
      confidence: z.number().min(0).max(1).describe("niveau de confiance")
    });

    this.classificationParser = StructuredOutputParser.fromZodSchema(classificationSchema);

    this.classificationPrompt = PromptTemplate.fromTemplate(`
Analyse ce document et classe-le automatiquement:

Nom du fichier: {filename}
Contenu extrait: {content}
Métadonnées: {metadata}

Règles de classification:
- contrats: accords, conventions, partenariats
- factures: documents de facturation, devis, commandes
- rapports: analyses, études, comptes-rendus
- presentations: slides, présentations client
- juridique: documents légaux, conformité
- rh: ressources humaines, paie, recrutement
- technique: documentation technique, spécifications
- marketing: campagnes, communication, branding
- finance: budgets, comptabilité, investissements

Niveaux de confidentialité:
- public: accessible à tous
- interne: employés uniquement
- confidentiel: accès restreint
- secret: haute sécurité

Rôles d'accès possibles: admin, manager, employee, hr, finance, legal, marketing, technical

{format_instructions}
`);

    this.classificationChain = RunnableSequence.from([
      this.classificationPrompt,
      this.llm,
      this.classificationParser
    ]);

    // ═══════════════════════════════════════════════════════════════
    // 🔍 INTELLIGENT SEARCH CHAIN
    // ═══════════════════════════════════════════════════════════════

    const searchSchema = z.object({
      searchTerms: z.array(z.string()).describe("termes de recherche extraits"),
      categories: z.array(z.string()).describe("catégories pertinentes"),
      dateRange: z.object({
        start: z.string().nullable(),
        end: z.string().nullable()
      }).describe("plage de dates si spécifiée"),
      confidentialityFilter: z.array(z.string()).describe("niveaux de confidentialité autorisés"),
      priority: z.enum(["any", "low", "medium", "high", "critical"]).describe("filtre de priorité"),
      searchStrategy: z.enum(["exact", "fuzzy", "semantic", "combined"]).describe("stratégie de recherche"),
      confidence: z.number().min(0).max(1).describe("confiance dans l'interprétation")
    });

    this.searchParser = StructuredOutputParser.fromZodSchema(searchSchema);

    this.searchPrompt = PromptTemplate.fromTemplate(`
Interprète cette requête de recherche en langage naturel:

Requête utilisateur: {query}
Rôle utilisateur: {userRole}
Contexte: {context}

Exemples de requêtes:
- "contrats signés le mois dernier" → catégorie: contrats, dateRange: mois dernier
- "factures importantes non payées" → catégorie: factures, priority: high
- "documents confidentiels sur le projet X" → confidentialityFilter: confidentiel, searchTerms: projet X
- "rapports techniques récents" → catégorie: rapports, subcategory: technique, dateRange: récent

Stratégies de recherche:
- exact: correspondance exacte des termes
- fuzzy: recherche approximative avec tolérance aux erreurs
- semantic: recherche sémantique basée sur le sens
- combined: combinaison des stratégies

{format_instructions}
`);

    this.searchChain = RunnableSequence.from([
      this.searchPrompt,
      this.llm,
      this.searchParser
    ]);

    // ═══════════════════════════════════════════════════════════════
    // 🚨 SECURITY ALERT CHAIN
    // ═══════════════════════════════════════════════════════════════

    const securitySchema = z.object({
      alertLevel: z.enum(["info", "warning", "critical", "emergency"]).describe("niveau d'alerte"),
      alertType: z.enum([
        "unauthorized_access", "document_expired", "suspicious_activity", 
        "data_breach", "permission_violation", "duplicate_detected"
      ]).describe("type d'alerte"),
      description: z.string().describe("description détaillée de l'incident"),
      affectedDocuments: z.array(z.string()).describe("documents concernés"),
      recommendedActions: z.array(z.string()).describe("actions recommandées"),
      notifyRoles: z.array(z.string()).describe("rôles à notifier"),
      autoActions: z.array(z.string()).describe("actions automatiques à effectuer"),
      confidence: z.number().min(0).max(1).describe("niveau de confiance")
    });

    this.securityParser = StructuredOutputParser.fromZodSchema(securitySchema);

    this.securityPrompt = PromptTemplate.fromTemplate(`
Analyse cet événement de sécurité et génère une alerte appropriée:

Événement: {event}
Utilisateur: {user}
Document: {document}
Action tentée: {action}
Contexte: {context}

Types d'alertes:
- unauthorized_access: accès non autorisé à un document
- document_expired: document expiré nécessitant renouvellement
- suspicious_activity: activité suspecte détectée
- data_breach: violation potentielle de données
- permission_violation: violation des permissions
- duplicate_detected: doublon détecté

Niveaux d'alerte:
- info: information générale
- warning: attention requise
- critical: action immédiate nécessaire
- emergency: urgence sécuritaire

{format_instructions}
`);

    this.securityChain = RunnableSequence.from([
      this.securityPrompt,
      this.llm,
      this.securityParser
    ]);

    // ═══════════════════════════════════════════════════════════════
    // 📄 DOCUMENT GENERATION CHAIN
    // ═══════════════════════════════════════════════════════════════

    this.documentGenerationPrompt = PromptTemplate.fromTemplate(`
Tu es un expert en rédaction de documents professionnels. Génère un document réaliste et détaillé basé sur ces spécifications:

Type de document: {documentType}
Contenu requis: {requirements}
Données: {data}
Format: {format}
Langue: {language}

Instructions spécifiques selon le type de document:

CONTRAT:
- Inclus des parties réelles (noms d'entreprises, adresses, représentants)
- Ajoute des clauses juridiques détaillées
- Spécifie des montants, délais, et conditions précises
- Inclus des articles numérotés avec obligations de chaque partie
- Termine par signatures et dates

RAPPORT FINANCIER:
- Inclus des chiffres réalistes (CA, charges, résultats)
- Ajoute des analyses par département
- Présente des graphiques et tableaux (en format texte)
- Inclus des recommandations concrètes
- Marque comme confidentiel

POLITIQUE/PROCÉDURE:
- Structure en sections numérotées
- Inclus des étapes détaillées
- Ajoute des responsabilités et rôles
- Spécifie des délais et critères
- Inclus des exemples concrets

PRÉSENTATION:
- Structure avec titre, agenda, sections
- Inclus des points clés et données
- Ajoute des conclusions et recommandations
- Formate pour présentation orale

Génère un document COMPLET et RÉALISTE avec:
- En-têtes et informations d'entreprise
- Contenu détaillé et professionnel
- Données chiffrées crédibles
- Clauses et conditions spécifiques
- Format approprié au type de document

Le document doit faire au minimum 500 mots et être immédiatement utilisable en entreprise.
`);

    this.documentGenerationChain = RunnableSequence.from([
      this.documentGenerationPrompt,
      this.llm,
      new StringOutputParser()
    ]);

    // ═══════════════════════════════════════════════════════════════
    // 🔄 DUPLICATE DETECTION CHAIN
    // ═══════════════════════════════════════════════════════════════

    const duplicateSchema = z.object({
      isDuplicate: z.boolean().describe("true si doublon détecté"),
      similarityScore: z.number().min(0).max(1).describe("score de similarité"),
      duplicateType: z.enum(["exact", "near_duplicate", "version", "similar_content"]).nullable().describe("type de doublon ou null si pas de doublon"),
      matchingDocuments: z.array(z.object({
        filename: z.string(),
        similarity: z.number(),
        reason: z.string()
      })).describe("documents similaires trouvés"),
      recommendedAction: z.enum(["keep_both", "merge", "delete_duplicate", "create_version"]).describe("action recommandée"),
      confidence: z.number().min(0).max(1).describe("niveau de confiance")
    });

    this.duplicateParser = StructuredOutputParser.fromZodSchema(duplicateSchema);

    this.duplicatePrompt = PromptTemplate.fromTemplate(`
Analyse si ce document est un doublon par rapport aux documents existants.

IMPORTANT: Répondez UNIQUEMENT avec du JSON valide, sans markdown ni formatage.

Nouveau document:
- Nom: {newFilename}
- Contenu: {newContent}
- Métadonnées: {newMetadata}

Documents existants:
{existingDocuments}

Critères de détection:
- exact: contenu identique
- near_duplicate: très similaire avec petites différences
- version: même document, version différente
- similar_content: contenu similaire mais distinct

Actions recommandées:
- keep_both: garder les deux documents
- merge: fusionner les documents
- delete_duplicate: supprimer le doublon
- create_version: créer une nouvelle version

{format_instructions}

Répondez UNIQUEMENT avec du JSON valide, sans balises markdown.
`);

    this.duplicateChain = RunnableSequence.from([
      this.duplicatePrompt,
      this.llm,
      {
        parse: (output) => {
          try {
            // Clean up markdown formatting if present
            let cleanOutput = output.content || output;
            if (typeof cleanOutput === 'string') {
              // Remove markdown code blocks
              cleanOutput = cleanOutput.replace(/```json\s*|\s*```/g, '').trim();
            }
            return this.duplicateParser.parse(cleanOutput);
          } catch (error) {
            console.error('JSON parsing error, using fallback:', error.message);
            return {
              isDuplicate: false,
              similarityScore: 0.0,
              duplicateType: null,
              matchingDocuments: [],
              recommendedAction: "keep_both",
              confidence: 0.0
            };
          }
        }
      }
    ]);
  }

  // ═══════════════════════════════════════════════════════════════
  // 📁 DOCUMENT CLASSIFICATION METHOD
  // ═══════════════════════════════════════════════════════════════

  async classifyDocument(filename, content, metadata = {}) {
    try {
      console.log('📁 Classification automatique du document...');
      
      const result = await this.classificationChain.invoke({
        filename: filename,
        content: content.substring(0, 2000), // Limiter pour l'analyse
        metadata: JSON.stringify(metadata),
        format_instructions: this.classificationParser.getFormatInstructions()
      });

      // Trigger n8n workflow for document classification
      await this.triggerN8nWorkflow('document-classified', {
        filename,
        classification: result,
        timestamp: new Date().toISOString()
      });

      console.log('✅ Classification terminée');
      return result;
      
    } catch (error) {
      console.error("❌ Erreur classification:", error.message);
      return {
        category: "autre",
        subcategory: "non-classé",
        confidentialityLevel: "interne",
        suggestedName: filename,
        tags: [],
        expirationDate: null,
        accessRoles: ["employee"],
        priority: "medium",
        confidence: 0.0,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔍 INTELLIGENT SEARCH METHOD
  // ═══════════════════════════════════════════════════════════════

  async intelligentSearch(query, userRole = "employee", context = {}) {
    try {
      console.log('🔍 Recherche intelligente en cours...');
      
      const searchParams = await this.searchChain.invoke({
        query: query,
        userRole: userRole,
        context: JSON.stringify(context),
        format_instructions: this.searchParser.getFormatInstructions()
      });

      // Effectuer la recherche basée sur les paramètres analysés
      const searchResults = await this.performDocumentSearch(searchParams, userRole);

      // Trigger n8n workflow for search analytics
      await this.triggerN8nWorkflow('document-searched', {
        query,
        userRole,
        searchParams,
        resultsCount: searchResults.length,
        timestamp: new Date().toISOString()
      });

      return {
        searchParams,
        results: searchResults,
        totalFound: searchResults.length
      };
      
    } catch (error) {
      console.error("❌ Erreur recherche intelligente:", error.message);
      return {
        searchParams: null,
        results: [],
        totalFound: 0,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🚨 SECURITY MONITORING METHOD
  // ═══════════════════════════════════════════════════════════════

  async checkSecurity(event, user, document, action, context = {}) {
    try {
      console.log('🚨 Vérification sécurité...');
      
      const securityAlert = await this.securityChain.invoke({
        event: event,
        user: user,
        document: document,
        action: action,
        context: JSON.stringify(context),
        format_instructions: this.securityParser.getFormatInstructions()
      });

      // Si alerte critique, déclencher n8n immédiatement
      if (securityAlert.alertLevel === 'critical' || securityAlert.alertLevel === 'emergency') {
        await this.triggerN8nWorkflow('security-alert', {
          alert: securityAlert,
          user,
          document,
          action,
          timestamp: new Date().toISOString()
        });
      }

      // Journaliser l'accès
      console.log(`🔒 Security check: ${user} -> ${document} (${action}) - ${securityAlert.alertLevel}`);

      return securityAlert;
      
    } catch (error) {
      console.error("❌ Erreur vérification sécurité:", error.message);
      return {
        alertLevel: "warning",
        alertType: "suspicious_activity",
        description: "Erreur lors de la vérification sécurité",
        affectedDocuments: [document],
        recommendedActions: ["Vérifier manuellement"],
        notifyRoles: ["admin"],
        autoActions: [],
        confidence: 0.0
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📄 DOCUMENT GENERATION METHOD
  // ═══════════════════════════════════════════════════════════════

  async generateDocument(documentType, requirements, data = {}, format = "markdown", language = "français") {
    try {
      console.log('📄 Génération automatique de document...');
      
      const generatedContent = await this.documentGenerationChain.invoke({
        documentType,
        requirements,
        data: JSON.stringify(data),
        format,
        language
      });

      // Créer le fichier avec un nom intelligent
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${documentType}_${timestamp}_${Date.now()}.${format === 'markdown' ? 'md' : 'txt'}`;
      
      // Sauvegarder le document généré
      const filePath = path.join(this.documentsPath, 'generated', filename);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, generatedContent, 'utf8');

      // Classifier automatiquement le document généré
      const classification = await this.classifyDocument(filename, generatedContent);

      // Trigger n8n workflow
      await this.triggerN8nWorkflow('document-generated', {
        filename,
        documentType,
        classification,
        filePath,
        timestamp: new Date().toISOString()
      });

      return {
        filename,
        content: generatedContent,
        classification,
        filePath,
        success: true
      };
      
    } catch (error) {
      console.error("❌ Erreur génération document:", error.message);
      return {
        filename: null,
        content: null,
        classification: null,
        filePath: null,
        success: false,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📝 REALISTIC FILENAME GENERATOR
  // ═══════════════════════════════════════════════════════════════

  generateRealisticFilename(documentType, data, timestamp, format) {
    const extension = format === 'markdown' ? 'md' : 'txt';
    
    // Noms réalistes selon le type de document
    const realisticNames = {
      'contrat': [
        `Contrat_Prestation_Services_${timestamp}`,
        `Accord_Partenariat_Commercial_${timestamp}`,
        `Contrat_Maintenance_Informatique_${timestamp}`,
        `Convention_Formation_Professionnelle_${timestamp}`,
        `Contrat_Licence_Logiciel_${timestamp}`
      ],
      'rapport': [
        `Rapport_Activite_Trimestriel_${timestamp}`,
        `Analyse_Performance_Financiere_${timestamp}`,
        `Rapport_Audit_Interne_${timestamp}`,
        `Bilan_Projet_Implementation_${timestamp}`,
        `Rapport_Conformite_RGPD_${timestamp}`
      ],
      'facture': [
        `Facture_Services_Conseil_${timestamp}`,
        `Devis_Installation_Systeme_${timestamp}`,
        `Facture_Maintenance_Annuelle_${timestamp}`,
        `Bon_Commande_Equipements_${timestamp}`,
        `Facture_Formation_Personnel_${timestamp}`
      ],
      'politique': [
        `Politique_Securite_Informatique_${timestamp}`,
        `Procedure_Gestion_Documents_${timestamp}`,
        `Charte_Utilisation_SI_${timestamp}`,
        `Politique_Confidentialite_Donnees_${timestamp}`,
        `Procedure_Sauvegarde_Restauration_${timestamp}`
      ],
      'presentation': [
        `Presentation_Resultats_Annuels_${timestamp}`,
        `Support_Formation_Utilisateurs_${timestamp}`,
        `Presentation_Nouveau_Produit_${timestamp}`,
        `Slides_Reunion_Direction_${timestamp}`,
        `Presentation_Strategie_Digitale_${timestamp}`
      ]
    };

    // Sélectionner un nom aléatoire selon le type
    const typeNames = realisticNames[documentType.toLowerCase()] || [
      `Document_${documentType}_${timestamp}`
    ];
    
    const randomName = typeNames[Math.floor(Math.random() * typeNames.length)];
    return `${randomName}.${extension}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔄 DUPLICATE DETECTION METHOD
  // ═══════════════════════════════════════════════════════════════

  async detectDuplicates(filename, content, metadata = {}) {
    try {
      console.log('🔄 Détection de doublons...');
      
      // Récupérer les documents existants pour comparaison
      const existingDocuments = await this.getExistingDocumentsForComparison();
      
      const duplicateAnalysis = await this.duplicateChain.invoke({
        newFilename: filename,
        newContent: content.substring(0, 1500),
        newMetadata: JSON.stringify(metadata),
        existingDocuments: JSON.stringify(existingDocuments),
        format_instructions: this.duplicateParser.getFormatInstructions()
      });

      // Si doublon détecté, trigger n8n workflow
      if (duplicateAnalysis.isDuplicate) {
        await this.triggerN8nWorkflow('duplicate-detected', {
          filename,
          duplicateAnalysis,
          timestamp: new Date().toISOString()
        });
      }

      return duplicateAnalysis;
      
    } catch (error) {
      console.error("❌ Erreur détection doublons:", error.message);
      return {
        isDuplicate: false,
        similarityScore: 0.0,
        duplicateType: "exact",
        matchingDocuments: [],
        recommendedAction: "keep_both",
        confidence: 0.0,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📋 VERSION MANAGEMENT METHOD
  // ═══════════════════════════════════════════════════════════════

  async createVersion(filename, content, userId, comment = "") {
    try {
      console.log('📋 Création de version...');
      
      const timestamp = new Date().toISOString();
      const versionId = crypto.randomUUID();
      
      // Créer le répertoire de versions pour ce fichier
      const fileVersionsPath = path.join(this.versionsPath, filename.replace(/\.[^/.]+$/, ""));
      await fs.mkdir(fileVersionsPath, { recursive: true });
      
      // Sauvegarder la version
      const versionFilename = `${filename}_v${timestamp}_${versionId}`;
      const versionPath = path.join(fileVersionsPath, versionFilename);
      await fs.writeFile(versionPath, content, 'utf8');
      
      // Métadonnées de version
      const versionMetadata = {
        versionId,
        originalFilename: filename,
        createdBy: userId,
        createdAt: timestamp,
        comment,
        size: Buffer.byteLength(content, 'utf8'),
        hash: crypto.createHash('sha256').update(content).digest('hex')
      };
      
      // Sauvegarder les métadonnées
      const metadataPath = path.join(fileVersionsPath, `${versionFilename}.meta.json`);
      await fs.writeFile(metadataPath, JSON.stringify(versionMetadata, null, 2), 'utf8');
      
      // Trigger n8n workflow
      await this.triggerN8nWorkflow('version-created', {
        filename,
        versionId,
        versionMetadata,
        timestamp
      });
      
      return {
        success: true,
        versionId,
        versionPath,
        metadata: versionMetadata
      };
      
    } catch (error) {
      console.error("❌ Erreur création version:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📅 EXPIRATION MONITORING METHOD
  // ═══════════════════════════════════════════════════════════════

  async checkExpirations() {
    try {
      console.log('📅 Vérification des expirations...');
      
      const today = new Date();
      const expiredDocuments = [];
      const soonToExpire = [];
      
      // Simuler la vérification des documents (en production, lire depuis la base de données)
      // Cette méthode devrait être appelée périodiquement (cron job)
      
      // Trigger n8n workflow pour les documents expirés
      if (expiredDocuments.length > 0) {
        await this.triggerN8nWorkflow('documents-expired', {
          expiredDocuments,
          count: expiredDocuments.length,
          timestamp: new Date().toISOString()
        });
      }
      
      // Trigger n8n workflow pour les documents bientôt expirés
      if (soonToExpire.length > 0) {
        await this.triggerN8nWorkflow('documents-expiring-soon', {
          soonToExpire,
          count: soonToExpire.length,
          timestamp: new Date().toISOString()
        });
      }
      
      return {
        expired: expiredDocuments,
        expiringSoon: soonToExpire,
        totalChecked: expiredDocuments.length + soonToExpire.length
      };
      
    } catch (error) {
      console.error("❌ Erreur vérification expirations:", error.message);
      return {
        expired: [],
        expiringSoon: [],
        totalChecked: 0,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔧 HELPER METHODS
  // ═══════════════════════════════════════════════════════════════

  async triggerN8nWorkflow(workflowName, data) {
    try {
      const response = await axios.post(`${this.n8nUrl}/${workflowName}`, {
        agent: 'dexo',
        workflow: workflowName,
        data: data,
        timestamp: new Date().toISOString()
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ n8n workflow '${workflowName}' déclenché`);
      return response.data;
    } catch (error) {
      console.error(`❌ Erreur n8n workflow '${workflowName}':`, error.message);
      return null;
    }
  }

  async performDocumentSearch(searchParams, userRole) {
    // Implémentation de la recherche basée sur les paramètres
    // En production, ceci interrogerait une base de données ou un index de recherche
    return [];
  }

  async getExistingDocumentsForComparison() {
    // Récupérer un échantillon de documents existants pour la comparaison
    // En production, ceci interrogerait une base de données
    return [];
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔧 ADVANCED HELPER METHODS
  // ═══════════════════════════════════════════════════════════════

  async ensureUniqueFilename(baseName, extension) {
    let counter = 1;
    let filename = `${baseName}${extension}`;
    
    while (await this.fileExists(filename)) {
      filename = `${baseName}_${counter}${extension}`;
      counter++;
    }
    
    return filename;
  }

  async fileExists(filename) {
    try {
      await fs.access(path.join(this.documentsPath, filename));
      return true;
    } catch {
      return false;
    }
  }

  async getUserInfo(userId) {
    // En production, récupérer depuis la base de données
    // Simulation pour les tests
    const mockUsers = {
      'user1': { id: 'user1', role: 'employee', department: 'IT' },
      'user2': { id: 'user2', role: 'manager', department: 'HR' },
      'admin': { id: 'admin', role: 'admin', department: 'Admin' },
      'current_user': { id: 'current_user', role: 'manager', department: 'General' }, // Added for Flutter app
      'test_user': { id: 'test_user', role: 'employee', department: 'Test' } // Added for testing
    };
    
    return mockUsers[userId] || null;
  }

  async saveShareConfig(shareConfig) {
    // En production: sauvegarder en base de données
    const configPath = path.join(this.documentsPath, 'shares', `${shareConfig.shareId}.json`);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(shareConfig, null, 2), 'utf8');
  }

  async findDocumentsByHash(hash) {
    // En production: requête base de données
    try {
      return await Document.find({ contentHash: hash }) || [];
    } catch (error) {
      // Si Document n'est pas disponible (tests), retourner tableau vide
      console.log('Document model not available, returning empty array');
      return [];
    }
  }

  async findSemanticSimilarDocuments(content, threshold = 0.8) {
    // Implémentation simplifiée - en production utiliser des embeddings
    try {
      const documents = await Document.find({});
      const similarDocs = [];
      
      for (const doc of documents) {
        if (doc.content) {
          const similarity = this.calculateTextSimilarity(content, doc.content);
          if (similarity > threshold) {
            similarDocs.push({
              document: doc,
              similarity: similarity
            });
          }
        }
      }
      
      return similarDocs;
    } catch (error) {
      console.log('Document model not available for semantic search, returning empty array');
      return [];
    }
  }

  calculateTextSimilarity(text1, text2) {
    // Implémentation basique de similarité textuelle
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  async findVersionSimilarDocuments(filename) {
    // Rechercher des documents avec des noms similaires (versions)
    const baseName = filename.replace(/(_v\d+)?(\.[^.]+)?$/, '');
    const pattern = new RegExp(baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    
    return await Document.find({ filename: pattern }) || [];
  }

  async findStructuralSimilarDocuments(content) {
    // Analyser la structure du document (headers, sections, etc.)
    const structure = this.extractDocumentStructure(content);
    // En production: comparer avec d'autres structures
    return [];
  }

  extractDocumentStructure(content) {
    return {
      headers: (content.match(/^#+\s+.+$/gm) || []).length,
      paragraphs: content.split('\n\n').length,
      lists: (content.match(/^\s*[-*+]\s+/gm) || []).length,
      length: content.length
    };
  }

  calculateOverallSimilarity(exact, semantic, version, structural) {
    let score = 0;
    
    if (exact.length > 0) score += 1.0;
    if (semantic.length > 0) score += Math.max(...semantic.map(s => s.similarity));
    if (version.length > 0) score += 0.7;
    if (structural.length > 0) score += 0.5;
    
    return Math.min(score, 1.0);
  }

  getRecommendedDuplicateAction(exact, semantic, version, structural) {
    if (exact.length > 0) return 'delete_duplicate';
    if (version.length > 0) return 'create_version';
    if (semantic.length > 0 && semantic[0]?.similarity > 0.9) return 'merge';
    return 'keep_both';
  }

  async saveAuditEntry(auditEntry) {
    // En production: sauvegarder en base de données sécurisée
    try {
      // Simulation - en production utiliser une collection MongoDB dédiée
      console.log('📝 Audit entry saved:', auditEntry.eventType);
    } catch (error) {
      console.error('Erreur sauvegarde audit:', error.message);
    }
  }

  async getRecentUserEvents(userId, hours = 24) {
    // Récupérer les événements récents de l'utilisateur
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    // En production: requête base de données
    return [];
  }

  detectRapidAccess(events) {
    // Détecter un accès trop rapide (plus de 10 documents en 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentEvents = events.filter(e => new Date(e.timestamp) > fiveMinutesAgo);
    
    return {
      detected: recentEvents.length > 10,
      severity: recentEvents.length > 10 ? 3 : 0,
      details: `${recentEvents.length} accès en 5 minutes`
    };
  }

  detectUnusualHours(events) {
    // Détecter un accès en dehors des heures normales (22h-6h)
    const unusualHourEvents = events.filter(e => {
      const hour = new Date(e.timestamp).getHours();
      return hour < 6 || hour > 22;
    });
    
    return {
      detected: unusualHourEvents.length > 0,
      severity: unusualHourEvents.length > 5 ? 2 : 1,
      details: `${unusualHourEvents.length} accès en heures inhabituelles`
    };
  }

  detectMassDownload(events) {
    // Détecter un téléchargement massif
    const downloadEvents = events.filter(e => e.action === 'download');
    
    return {
      detected: downloadEvents.length > 20,
      severity: downloadEvents.length > 20 ? 4 : 0,
      details: `${downloadEvents.length} téléchargements`
    };
  }

  detectPrivilegeEscalation(events) {
    // Détecter une tentative d'escalade de privilèges
    const deniedEvents = events.filter(e => e.eventType === 'unauthorized_access_attempt');
    
    return {
      detected: deniedEvents.length > 3,
      severity: deniedEvents.length > 3 ? 5 : 0,
      details: `${deniedEvents.length} tentatives d'accès non autorisé`
    };
  }

  detectGeographicAnomaly(events) {
    // Détecter des accès depuis des localisations inhabituelles
    // En production: analyser les adresses IP
    return {
      detected: false,
      severity: 0,
      details: 'Analyse géographique non implémentée'
    };
  }

  getSecurityRecommendations(patterns) {
    const recommendations = [];
    
    if (patterns.rapidAccess?.detected) {
      recommendations.push('Limiter le taux d\'accès par utilisateur');
    }
    if (patterns.massDownload?.detected) {
      recommendations.push('Suspendre temporairement les privilèges de téléchargement');
    }
    if (patterns.privilegeEscalation?.detected) {
      recommendations.push('Bloquer immédiatement l\'utilisateur et alerter l\'administrateur');
    }
    
    return recommendations;
  }

  async createSecurityAlert(alertData) {
    try {
      const alert = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...alertData
      };
      
      // Trigger n8n workflow pour alerte sécurité
      await this.triggerN8nWorkflow('security-alert-behavioral', alert);
      
      // Incrémenter les métriques
      this.securityMetrics.securityAlerts++;
      
      console.log(`🚨 Alerte sécurité créée: ${alertData.type} pour utilisateur ${alertData.userId}`);
      return alert;
      
    } catch (error) {
      console.error('Erreur création alerte sécurité:', error.message);
    }
  }

  async handleExpiredDocument(document) {
    try {
      // Marquer comme expiré
      await Document.findByIdAndUpdate(document._id, {
        status: 'expired',
        expiredAt: new Date()
      });
      
      // Déplacer vers quarantaine si critique
      if (document.confidentiality === 'critique') {
        await this.moveToQuarantine(document);
      }
      
      // Notifier les responsables
      await this.triggerN8nWorkflow('document-expired-individual', {
        documentId: document._id,
        filename: document.filename,
        expirationDate: document.expirationDate,
        confidentiality: document.confidentiality
      });
      
    } catch (error) {
      console.error('Erreur gestion document expiré:', error.message);
    }
  }

  async sendExpirationWarning(document) {
    try {
      const daysUntilExpiration = Math.ceil(
        (new Date(document.expirationDate) - new Date()) / (1000 * 60 * 60 * 24)
      );
      
      await this.triggerN8nWorkflow('document-expiration-warning', {
        documentId: document._id,
        filename: document.filename,
        expirationDate: document.expirationDate,
        daysUntilExpiration,
        owners: document.accessRoles || []
      });
      
    } catch (error) {
      console.error('Erreur envoi avertissement expiration:', error.message);
    }
  }

  async attemptAutoRenewal(document) {
    try {
      // Logique de renouvellement automatique
      if (document.autoRenewal && document.renewalTemplate) {
        const newExpirationDate = new Date(
          new Date(document.expirationDate).getTime() + 
          (document.renewalPeriodDays || 365) * 24 * 60 * 60 * 1000
        );
        
        await Document.findByIdAndUpdate(document._id, {
          expirationDate: newExpirationDate,
          lastRenewalDate: new Date(),
          renewalCount: (document.renewalCount || 0) + 1
        });
        
        return { success: true, newExpirationDate };
      }
      
      return { success: false, reason: 'Auto-renewal not configured' };
      
    } catch (error) {
      console.error('Erreur renouvellement automatique:', error.message);
      return { success: false, reason: error.message };
    }
  }

  async scanUnauthorizedAccess() {
    // Scanner les tentatives d'accès non autorisé récentes
    return { count: this.securityMetrics.unauthorizedAttempts, severity: 'medium' };
  }

  async scanSuspiciousFiles() {
    // Scanner les fichiers suspects (taille anormale, extensions dangereuses, etc.)
    return { count: 0, severity: 'low' };
  }

  async performIntegrityCheck() {
    // Vérifier l'intégrité des fichiers critiques
    return { status: 'ok', modifiedFiles: 0 };
  }

  async detectAccessAnomalies() {
    // Détecter les anomalies d'accès
    return { anomalies: 0, severity: 'low' };
  }

  async checkSystemHealth() {
    // Vérifier la santé du système
    return {
      diskSpace: 'ok',
      memory: 'ok',
      services: 'ok',
      overall: 'healthy'
    };
  }

  calculateSecurityScore(scanResults) {
    let score = 100;
    
    // Déduire des points selon les problèmes détectés
    score -= scanResults.unauthorizedAccess.count * 5;
    score -= scanResults.suspiciousFiles.count * 3;
    score -= scanResults.integrityCheck.modifiedFiles * 10;
    score -= scanResults.accessAnomalies.anomalies * 2;
    
    return Math.max(score, 0);
  }

  async saveSecurityScanReport(scanResults) {
    try {
      const reportPath = path.join(__dirname, '../logs', `security-scan-${Date.now()}.json`);
      await fs.writeFile(reportPath, JSON.stringify(scanResults, null, 2), 'utf8');
    } catch (error) {
      console.error('Erreur sauvegarde rapport sécurité:', error.message);
    }
  }

  async moveToQuarantine(document) {
    try {
      const quarantinePath = path.join(this.securityConfig.quarantinePath, document.filename);
      // En production: déplacer le fichier physique
      console.log(`🔒 Document ${document.filename} déplacé en quarantaine`);
    } catch (error) {
      console.error('Erreur déplacement quarantaine:', error.message);
    }
  }

  generateProcessingRecommendations(classification, duplicateCheck, securityCheck) {
    const recommendations = [];

    // Recommandations basées sur la classification
    if (classification.confidentialityLevel === 'secret' || classification.confidentialityLevel === 'confidentiel') {
      recommendations.push({
        type: "security",
        action: "restrict_access",
        message: `Document classé ${classification.confidentialityLevel} - Accès restreint requis`,
        priority: "high"
      });
    }

    // Recommandations basées sur les doublons
    if (duplicateCheck.isDuplicate) {
      recommendations.push({
        type: "duplicate",
        action: duplicateCheck.recommendedAction,
        message: `Doublon détecté (${duplicateCheck.duplicateType}) - ${duplicateCheck.recommendedAction}`,
        priority: "medium"
      });
    }

    // Recommandations basées sur la sécurité
    if (securityCheck.alertLevel === 'warning' || securityCheck.alertLevel === 'critical') {
      recommendations.push({
        type: "security",
        action: "review_access",
        message: `Alerte sécurité ${securityCheck.alertLevel} - Révision nécessaire`,
        priority: securityCheck.alertLevel === 'critical' ? "high" : "medium"
      });
    }

    // Recommandations d'expiration
    if (classification.expirationDate) {
      recommendations.push({
        type: "expiration",
        action: "set_reminder",
        message: `Document expire le ${classification.expirationDate} - Programmer rappel`,
        priority: "low"
      });
    }

    return recommendations;
  }

  // ═══════════════════════════════════════════════════════════════
  // 🎯 MAIN ENHANCED DOCUMENT PROCESSING WORKFLOW
  // ═══════════════════════════════════════════════════════════════

  async processDocumentAdvanced(filename, content, userId, metadata = {}) {
    try {
      console.log('🎯 Traitement avancé du document...');
      const startTime = Date.now();
      
      // 1. Vérification sécurité préliminaire
      const securityCheck = await this.checkSecurity('document_upload', userId, filename, 'upload', metadata);
      
      if (securityCheck.alertLevel === 'critical' || securityCheck.alertLevel === 'emergency') {
        return {
          success: false,
          error: 'Accès refusé pour des raisons de sécurité',
          securityAlert: securityCheck
        };
      }
      
      // 2. Classification automatique avancée
      const classification = await this.classifyDocument(filename, content, metadata);
      
      // 3. Génération de nom intelligent
      const intelligentName = await this.generateIntelligentName(content, metadata, classification);
      
      // 4. Détection avancée de doublons
      const duplicateCheck = await this.detectAdvancedDuplicates(intelligentName, content, metadata);
      
      // 5. Vérification des permissions d'accès
      const accessCheck = await this.checkAccessPermissions(userId, 'new_document', 'create');
      
      // 6. Création de version si nécessaire
      let versionInfo = null;
      if (duplicateCheck.recommendedAction === 'create_version') {
        versionInfo = await this.createVersion(intelligentName, content, userId, 'Version automatique');
      }
      
      // 7. Journalisation complète
      await this.logSecurityEvent('document_processed', userId, intelligentName, 'create', {
        success: true,
        classification: classification.category,
        confidentiality: classification.confidentialityLevel,
        additionalData: { processingTime: Date.now() - startTime }
      });
      
      const processingTime = Date.now() - startTime;
      
      // 8. Résultat final avec recommandations avancées
      const result = {
        success: true,
        originalFilename: filename,
        intelligentFilename: intelligentName,
        classification,
        duplicateCheck,
        securityCheck,
        accessCheck,
        versionInfo,
        processingTime,
        recommendations: this.generateAdvancedRecommendations(classification, duplicateCheck, securityCheck, accessCheck),
        securityScore: this.calculateDocumentSecurityScore(classification, duplicateCheck, securityCheck),
        metadata: {
          timestamp: new Date().toISOString(),
          processedBy: 'dexo-agent-advanced',
          langchainVersion: "0.2.0",
          securityLevel: classification.confidentialityLevel,
          userId
        }
      };
      
      // 9. Trigger n8n workflow final avec données enrichies
      await this.triggerN8nWorkflow('document-processed-advanced', result);
      
      // 10. Mise à jour des métriques
      this.securityMetrics.documentsClassified++;
      if (duplicateCheck.exactDuplicates || duplicateCheck.semanticSimilarity) {
        this.securityMetrics.duplicatesDetected++;
      }
      
      console.log(`✅ Document traité avec succès en ${processingTime}ms`);
      return result;
      
    } catch (error) {
      console.error("❌ Erreur traitement avancé document:", error.message);
      
      // Journaliser l'erreur
      await this.logSecurityEvent('document_processing_error', userId, filename, 'create', {
        success: false,
        errorMessage: error.message
      });
      
      return {
        success: false,
        error: error.message,
        filename,
        processingTime: Date.now() - Date.now()
      };
    }
  }

  generateAdvancedRecommendations(classification, duplicateCheck, securityCheck, accessCheck) {
    const recommendations = this.generateProcessingRecommendations(classification, duplicateCheck, securityCheck);
    
    // Ajouter des recommandations avancées
    if (!accessCheck.allowed) {
      recommendations.push({
        type: "access",
        action: "review_permissions",
        message: `Accès refusé: ${accessCheck.reason}`,
        priority: "high"
      });
    }
    
    if (duplicateCheck.semanticSimilarity) {
      recommendations.push({
        type: "content",
        action: "review_similarity",
        message: `Contenu similaire détecté - Vérifier la pertinence`,
        priority: "medium"
      });
    }
    
    return recommendations;
  }

  calculateDocumentSecurityScore(classification, duplicateCheck, securityCheck) {
    let score = 100;
    
    // Déduire selon le niveau de confidentialité
    const confidentialityPenalty = {
      'public': 0,
      'interne': 5,
      'confidentiel': 15,
      'critique': 25
    };
    score -= confidentialityPenalty[classification.confidentialityLevel] || 0;
    
    // Déduire selon les alertes sécurité
    const securityPenalty = {
      'info': 0,
      'warning': 10,
      'critical': 30,
      'emergency': 50
    };
    score -= securityPenalty[securityCheck.alertLevel] || 0;
    
    // Déduire selon les doublons
    if (duplicateCheck.exactDuplicates) score -= 20;
    if (duplicateCheck.semanticSimilarity) score -= 10;
    
    return Math.max(score, 0);
  }

  // ═══════════════════════════════════════════════════════════════
  // 💾 SAVE CLASSIFIED DOCUMENT METHOD
  // ═══════════════════════════════════════════════════════════════

  async saveClassifiedDocument(filename, content, classification, userId, metadata = {}) {
    try {
      console.log(`💾 Sauvegarde document classifié: ${filename}`);
      
      // Générer un nom intelligent si pas déjà fait
      const intelligentName = classification.suggestedName || filename;
      
      // Créer le hash du contenu pour éviter les doublons
      const contentHash = crypto.createHash('sha256').update(content).digest('hex');
      
      // Sauvegarder aussi physiquement le fichier
      const filePath = await this.saveToFileSystem(intelligentName, content, classification);
      
      // Préparer les données du document pour MongoDB
      const documentData = {
        filename: intelligentName,
        originalName: filename, // Required field
        suggestedName: classification.suggestedName || intelligentName,
        content: content,
        contentHash: contentHash,
        category: classification.category || 'autre',
        subcategory: classification.subcategory || '',
        confidentialityLevel: classification.confidentialityLevel || 'interne',
        tags: classification.tags || [],
        expirationDate: classification.expirationDate ? new Date(classification.expirationDate) : null,
        accessRoles: classification.accessRoles || ['employee'],
        priority: classification.priority || 'medium',
        confidence: classification.confidence || 0.0,
        uploadedBy: userId, // Will be converted to ObjectId if needed
        uploadedAt: new Date(),
        size: Buffer.byteLength(content, 'utf8'),
        status: 'active',
        filePath: filePath, // Required field
        mimetype: 'text/plain', // Required field - default for text content
        hash: contentHash, // Required field
        searchableContent: content, // For text search
        aiClassification: {
          confidence: classification.confidence || 0.0,
          processedAt: new Date(),
          model: 'dexo-agent-v1'
        },
        metadata: {
          ...metadata,
          classification: classification,
          source: 'mobile_app',
          timestamp: new Date().toISOString()
        }
      };

      // Sauvegarder en base de données
      let savedDocument;
      try {
        // Try to convert userId to ObjectId if it's a string
        if (typeof userId === 'string' && userId.length === 24) {
          try {
            documentData.uploadedBy = new mongoose.Types.ObjectId(userId);
          } catch (e) {
            // If conversion fails, create a dummy ObjectId
            documentData.uploadedBy = new mongoose.Types.ObjectId();
          }
        } else {
          // Create a dummy ObjectId for non-ObjectId userIds
          documentData.uploadedBy = new mongoose.Types.ObjectId();
        }

        savedDocument = new Document(documentData);
        await savedDocument.save();
        
        console.log(`✅ Document sauvegardé en base: ${savedDocument._id}`);
        
      } catch (dbError) {
        console.error('Erreur sauvegarde base de données:', dbError.message);
        // En cas d'erreur DB, continuer avec le système de fichiers
        return {
          success: true,
          message: 'Document sauvegardé dans le système de fichiers',
          documentId: crypto.randomUUID(),
          filename: intelligentName,
          filePath: filePath,
          classification: classification,
          fallbackMode: true
        };
      }

      // Journaliser l'événement
      await this.logSecurityEvent('document_saved', userId, savedDocument._id.toString(), 'create', {
        success: true,
        category: classification.category,
        confidentiality: classification.confidentialityLevel
      });

      // Trigger n8n workflow
      await this.triggerN8nWorkflow('document-saved', {
        documentId: savedDocument._id,
        filename: intelligentName,
        category: classification.category,
        confidentiality: classification.confidentialityLevel,
        userId: userId,
        timestamp: new Date().toISOString()
      });

      // Mettre à jour les métriques
      this.securityMetrics.documentsClassified++;

      console.log(`✅ Document sauvegardé avec succès: ${savedDocument._id}`);
      return {
        success: true,
        message: 'Document sauvegardé avec succès',
        documentId: savedDocument._id,
        filename: intelligentName,
        filePath: filePath,
        classification: classification,
        savedAt: savedDocument.uploadedAt
      };

    } catch (error) {
      console.error('❌ Erreur sauvegarde document classifié:', error.message);
      
      // Journaliser l'erreur
      await this.logSecurityEvent('document_save_error', userId, filename, 'create', {
        success: false,
        errorMessage: error.message
      });

      return {
        success: false,
        error: error.message,
        filename: filename
      };
    }
  }

  async saveToFileSystem(filename, content, classification) {
    try {
      // Déterminer le répertoire basé sur la classification
      const department = this.mapCategoryToDepartment(classification.category);
      const confidentiality = classification.confidentialityLevel || 'interne';
      
      const targetDir = path.join(
        this.documentsPath, 
        'classified', 
        department, 
        confidentiality
      );
      
      // Créer le répertoire si nécessaire
      await fs.mkdir(targetDir, { recursive: true });
      
      // Générer un nom de fichier unique
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeFilename = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = path.join(targetDir, safeFilename);
      
      // Sauvegarder le fichier
      await fs.writeFile(filePath, content, 'utf8');
      
      console.log(`📁 Fichier sauvegardé: ${filePath}`);
      return filePath;
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde fichier:', error.message);
      throw error;
    }
  }

  mapCategoryToDepartment(category) {
    const categoryMapping = {
      'contrats': 'Juridique',
      'factures': 'Finance', 
      'rapports': 'Technique',
      'presentations': 'Marketing',
      'juridique': 'Juridique',
      'rh': 'RH',
      'technique': 'Technique',
      'marketing': 'Marketing',
      'finance': 'Finance',
      'autre': 'Commercial'
    };
    
    return categoryMapping[category] || 'Commercial';
  }

  // ═══════════════════════════════════════════════════════════════
  // 📂 GET DOCUMENTS BY CATEGORY METHOD
  // ═══════════════════════════════════════════════════════════════

  async getDocumentsByCategory(category, userId = null, limit = 20, offset = 0) {
    try {
      console.log(`📂 Récupération documents catégorie: ${category}`);
      
      // Build query filter
      const filter = { category: category, status: { $ne: 'deleted' } };
      
      // Add user filter if provided (for access control)
      if (userId) {
        // In production, add proper access control based on user roles
        // For now, we'll return all documents in the category
      }

      let documents = [];
      let totalCount = 0;

      try {
        // Try to get from database first
        totalCount = await Document.countDocuments(filter);
        const dbDocuments = await Document.find(filter)
          .sort({ uploadedAt: -1 }) // Most recent first
          .limit(limit)
          .skip(offset)
          .select({
            filename: 1,
            originalName: 1,
            category: 1,
            subcategory: 1,
            confidentialityLevel: 1,
            tags: 1,
            uploadedBy: 1,
            uploadedAt: 1,
            size: 1,
            priority: 1,
            expirationDate: 1,
            status: 1,
            filePath: 1,
            hash: 1
          })
          .lean();

        // Convert MongoDB documents to plain objects
        documents = dbDocuments.map(doc => ({
          id: doc._id.toString(),
          filename: doc.filename,
          originalFilename: doc.originalName, // Map originalName to originalFilename
          category: doc.category,
          subcategory: doc.subcategory || '',
          confidentialityLevel: doc.confidentialityLevel || 'interne',
          tags: doc.tags || [],
          uploadedBy: doc.uploadedBy ? doc.uploadedBy.toString() : 'unknown',
          uploadedAt: doc.uploadedAt,
          size: doc.size || 0,
          priority: doc.priority || 'medium',
          expirationDate: doc.expirationDate,
          status: doc.status || 'active',
          filePath: doc.filePath,
          hash: doc.hash,
          source: 'database'
        }));

        console.log(`✅ Trouvé ${documents.length} documents en base pour ${category}`);

      } catch (dbError) {
        console.log('Database not available, using file system fallback');
        
        // Fallback: scan file system for documents
        const department = this.mapCategoryToDepartment(category);
        const categoryPath = path.join(this.documentsPath, 'classified', department);
        
        try {
          const files = await this.scanDirectoryForDocuments(categoryPath, category);
          documents = files.slice(offset, offset + limit);
          totalCount = files.length;
          console.log(`✅ Trouvé ${documents.length} documents en fichiers pour ${category}`);
        } catch (fsError) {
          console.log('File system scan failed, returning empty results');
          documents = [];
          totalCount = 0;
        }
      }

      const hasMore = (offset + limit) < totalCount;

      console.log(`✅ Retour final: ${documents.length} documents dans ${category}`);
      
      return {
        documents,
        totalCount,
        hasMore,
        category,
        limit,
        offset
      };

    } catch (error) {
      console.error('❌ Erreur récupération documents par catégorie:', error.message);
      return {
        documents: [],
        totalCount: 0,
        hasMore: false,
        category,
        limit,
        offset,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📖 GET DOCUMENT CONTENT METHOD
  // ═══════════════════════════════════════════════════════════════

  async getDocumentContent(documentId, userId = null) {
    try {
      console.log(`📖 Récupération contenu document: ${documentId}`);
      
      let document = null;
      
      try {
        // Try to get from database first
        document = await Document.findById(documentId);
        
        if (document) {
          console.log(`✅ Document trouvé en base: ${document.filename}`);
          
          // Check access permissions if userId provided
          if (userId) {
            const accessCheck = await this.checkAccessPermissions(userId, documentId, 'read');
            if (!accessCheck.allowed) {
              return {
                success: false,
                error: `Accès refusé: ${accessCheck.reason}`
              };
            }
          }
          
          // Try to read content from database first
          if (document.searchableContent) {
            console.log('✅ Contenu trouvé dans la base de données');
            return {
              success: true,
              content: document.searchableContent,
              filename: document.filename,
              originalFilename: document.originalName,
              category: document.category,
              confidentialityLevel: document.confidentialityLevel,
              source: 'database'
            };
          }
          
          // If no content in database, try to read from file system
          if (document.filePath) {
            try {
              const fileContent = await fs.readFile(document.filePath, 'utf8');
              console.log('✅ Contenu lu depuis le système de fichiers');
              
              // Update database with content for future reads
              await Document.findByIdAndUpdate(documentId, {
                searchableContent: fileContent
              });
              
              return {
                success: true,
                content: fileContent,
                filename: document.filename,
                originalFilename: document.originalName,
                category: document.category,
                confidentialityLevel: document.confidentialityLevel,
                source: 'filesystem'
              };
            } catch (fileError) {
              console.error('❌ Erreur lecture fichier:', fileError.message);
              return {
                success: false,
                error: 'Fichier non accessible'
              };
            }
          }
          
          return {
            success: false,
            error: 'Contenu du document non disponible'
          };
        }
        
      } catch (dbError) {
        console.log('Database not available, trying file system fallback');
      }
      
      // Fallback: try to find document in file system
      // This is a simplified approach - in production you'd have better indexing
      return {
        success: false,
        error: 'Document non trouvé'
      };
      
    } catch (error) {
      console.error('❌ Erreur récupération contenu document:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async scanDirectoryForDocuments(directoryPath, category) {
    try {
      const documents = [];
      
      // Scan all confidentiality levels
      const confidentialityLevels = ['public', 'interne', 'confidentiel', 'critique'];
      
      for (const level of confidentialityLevels) {
        const levelPath = path.join(directoryPath, level);
        
        try {
          const files = await fs.readdir(levelPath);
          
          for (const file of files) {
            if (file.endsWith('.json')) continue; // Skip metadata files
            
            const filePath = path.join(levelPath, file);
            const stats = await fs.stat(filePath);
            
            // Extract timestamp from filename if available
            const timestampMatch = file.match(/^(\d{4}-\d{2}-\d{2}T[\d-]+)_/);
            const uploadedAt = timestampMatch ? new Date(timestampMatch[1].replace(/-/g, ':')) : stats.birthtime;
            
            documents.push({
              id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              filename: file,
              originalFilename: file.replace(/^\d{4}-\d{2}-\d{2}T[\d-]+_/, ''),
              category: category,
              subcategory: '',
              confidentialityLevel: level,
              tags: [],
              uploadedBy: 'unknown',
              uploadedAt: uploadedAt,
              size: stats.size,
              priority: 'medium',
              expirationDate: null,
              status: 'active',
              source: 'filesystem'
            });
          }
        } catch (levelError) {
          // Level directory doesn't exist, skip
          continue;
        }
      }
      
      // Sort by upload date (most recent first)
      documents.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      
      return documents;
      
    } catch (error) {
      console.error('Erreur scan répertoire:', error.message);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔄 FULL DOCUMENT PROCESSING WORKFLOW
  // ═══════════════════════════════════════════════════════════════

  async processDocument(filename, content, userId, metadata = {}) {
    try {
      console.log('🤖 DEXO: Processing document autonomously...');
      const startTime = Date.now();
      
      // 1. Security check (simplified)
      const securityCheck = await this.checkSecurity('document_upload', userId, filename, 'upload', metadata);
      
      if (securityCheck.alertLevel === 'critical' || securityCheck.alertLevel === 'emergency') {
        console.log('🛡️ DEXO: Document blocked for security reasons');
        return {
          success: false,
          error: 'Document blocked by autonomous security system',
          securityAlert: securityCheck,
          autonomousAction: true
        };
      }
      
      // 2. Duplicate detection (simplified)
      const duplicateCheck = await this.detectDuplicates(filename, content, metadata);
      
      // 3. AI Classification (autonomous)
      const classification = await this.classifyDocument(filename, content, metadata);
      console.log(`🏷️ DEXO: Classified as "${classification.category}" with ${Math.round(classification.confidence * 100)}% confidence`);
      
      // 4. Autonomous decisions
      const autonomousDecisions = {
        security: securityCheck.alertLevel !== 'none' ? 'auto_handled' : 'no_action_needed',
        duplicates: duplicateCheck.hasDuplicates ? 'version_created' : 'no_duplicates',
        classification: classification.confidence > 0.8 ? 'high_confidence' : 'acceptable',
        storage: 'auto_organized'
      };
      
      // 5. Auto-save document
      let saveResult;
      try {
        saveResult = await this.saveClassifiedDocument(filename, content, classification, userId, {
          ...metadata,
          autonomousProcessing: true,
          processingTimestamp: new Date()
        });
      } catch (saveError) {
        console.log('💾 DEXO: Document processed but save had issues');
        saveResult = { success: true, message: 'Processed autonomously' };
      }
      
      const processingTime = Date.now() - startTime;
      
      // 6. Final result
      const result = {
        success: true,
        filename,
        classification,
        duplicateCheck,
        securityCheck,
        processingTime,
        autonomousDecisions,
        workflowsTriggered: ['document-processed-autonomous'],
        metadata: {
          timestamp: new Date().toISOString(),
          processedBy: 'dexo-autonomous',
          userInteractionRequired: false,
          autonomousMode: true
        }
      };
      
      console.log(`✅ DEXO: Document processed autonomously in ${processingTime}ms`);
      console.log(`🤖 DEXO: Made ${Object.keys(autonomousDecisions).length} autonomous decisions`);
      
      return result;
      
    } catch (error) {
      console.error("❌ DEXO Autonomous Processing Error:", error.message);
      
      return {
        success: false,
        error: error.message,
        autonomousErrorHandling: true,
        fallbackProcessing: true
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🏷️ INTELLIGENT NAMING METHOD
  // ═══════════════════════════════════════════════════════════════

  async generateIntelligentName(content, metadata = {}, classification = null) {
    try {
      console.log('🏷️ Génération de nom intelligent...');
      
      // Si pas de classification, la faire d'abord
      if (!classification) {
        classification = await this.classifyDocument(metadata.originalName || 'document', content, metadata);
      }

      const namingPrompt = PromptTemplate.fromTemplate(`
Génère un nom de fichier standardisé et intelligent pour ce document:

Contenu: {content}
Classification: {classification}
Métadonnées: {metadata}

Format requis: <Département>_<TypeDoc>_<Sujet>_<Date>_<Version>

Règles:
- Département: {departments}
- TypeDoc: {documentTypes}
- Sujet: extrait du contenu (max 3 mots, sans espaces)
- Date: YYYY-MM-DD
- Version: v1, v2, etc.

Exemples:
- Finance_Facture_ClientABC_2024-01-15_v1.pdf
- RH_Contrat_DeveloppeurSenior_2024-01-15_v1.pdf
- Juridique_Politique_TeletravailNouvelle_2024-01-15_v1.pdf

Génère UNIQUEMENT le nom de fichier, sans extension.
`);

      const intelligentName = await this.llm.invoke(
        await namingPrompt.format({
          content: content.substring(0, 500),
          classification: JSON.stringify(classification),
          metadata: JSON.stringify(metadata),
          departments: this.taxonomy.departments.join(', '),
          documentTypes: this.taxonomy.documentTypes.join(', ')
        })
      );

      // Nettoyer et valider le nom
      const cleanName = intelligentName.content
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .substring(0, 100);

      // Vérifier les doublons et incrémenter si nécessaire
      const finalName = await this.ensureUniqueFilename(cleanName, metadata.extension || '.pdf');

      console.log(`✅ Nom intelligent généré: ${finalName}`);
      return finalName;

    } catch (error) {
      console.error('❌ Erreur génération nom intelligent:', error.message);
      const fallbackName = `Document_${Date.now()}_v1`;
      return fallbackName;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔐 ROLE-BASED ACCESS CONTROL (RBAC)
  // ═══════════════════════════════════════════════════════════════

  async checkAccessPermissions(userId, documentId, action = 'read') {
    try {
      console.log(`🔐 Vérification accès: ${userId} -> ${documentId} (${action})`);

      // Pour les tests, simuler des documents
      let document = null;
      if (documentId.startsWith('doc_')) {
        // Documents de test simulés
        const mockDocuments = {
          'doc_public': { confidentiality: 'public' },
          'doc_confidentiel': { confidentiality: 'confidentiel' },
          'doc_critique': { confidentiality: 'critique' },
          'doc_test_1': { confidentiality: 'interne' }, // Pour les tests de partage
          'doc_test_2': { confidentiality: 'confidentiel' }
        };
        document = mockDocuments[documentId];
      } else {
        // Récupérer le document réel de la base de données
        document = await Document.findById(documentId);
      }

      if (!document) {
        return { allowed: false, reason: 'Document non trouvé' };
      }

      // Récupérer les informations utilisateur (simulé)
      const user = await this.getUserInfo(userId);
      if (!user) {
        return { allowed: false, reason: 'Utilisateur non trouvé' };
      }

      // Vérifier les permissions basées sur le niveau de confidentialité
      const confidentialityLevel = document.confidentialityLevel || document.confidentiality || 'interne';
      const confidentialityConfig = this.taxonomy.confidentialityLevels[confidentialityLevel];
      if (!confidentialityConfig) {
        return { allowed: false, reason: 'Niveau de confidentialité invalide' };
      }

      // Vérifier si le rôle utilisateur est autorisé
      const hasRoleAccess = confidentialityConfig.roles.includes('all') || 
                           confidentialityConfig.roles.includes(user.role);

      if (!hasRoleAccess) {
        await this.logSecurityEvent('unauthorized_access_attempt', userId, documentId, action);
        return { 
          allowed: false, 
          reason: `Accès refusé: rôle ${user.role} non autorisé pour niveau ${confidentialityLevel}` 
        };
      }

      // Vérifier les permissions spécifiques par action
      const actionPermissions = {
        'read': ['employee', 'manager', 'admin'],
        'write': ['manager', 'admin'],
        'delete': ['admin'],
        'share': ['manager', 'admin']
      };

      if (!actionPermissions[action]?.includes(user.role)) {
        return { 
          allowed: false, 
          reason: `Action ${action} non autorisée pour le rôle ${user.role}` 
        };
      }

      // Journaliser l'accès autorisé
      await this.logSecurityEvent('access_granted', userId, documentId, action);

      return { 
        allowed: true, 
        reason: 'Accès autorisé',
        userRole: user.role,
        documentLevel: document.confidentiality
      };

    } catch (error) {
      console.error('❌ Erreur vérification accès:', error.message);
      return { allowed: false, reason: 'Erreur système' };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔗 SECURE SHARING SYSTEM
  // ═══════════════════════════════════════════════════════════════

  async createSecureShareLink(documentId, userId, options = {}) {
    try {
      console.log('🔗 Création de lien de partage sécurisé...');

      // Vérifier les permissions de partage
      const accessCheck = await this.checkAccessPermissions(userId, documentId, 'share');
      if (!accessCheck.allowed) {
        return {
          success: false,
          error: accessCheck.reason
        };
      }

      // Générer un token sécurisé
      const shareToken = crypto.randomBytes(32).toString('hex');
      const shareId = crypto.randomUUID();

      // Configuration du partage
      const shareConfig = {
        shareId,
        documentId,
        createdBy: userId,
        token: shareToken,
        expiresAt: options.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h par défaut
        maxDownloads: options.maxDownloads || 10,
        currentDownloads: 0,
        requirePassword: options.requirePassword || false,
        password: options.password ? crypto.createHash('sha256').update(options.password).digest('hex') : null,
        allowedIPs: options.allowedIPs || [],
        notifyOnAccess: options.notifyOnAccess || true,
        createdAt: new Date(),
        accessLog: []
      };

      // Sauvegarder la configuration de partage (en production: base de données)
      await this.saveShareConfig(shareConfig);

      // Générer l'URL sécurisée
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const secureUrl = `${baseUrl}/api/dexo/secure-share/${shareId}?token=${shareToken}`;

      // Trigger n8n workflow pour notification
      await this.triggerN8nWorkflow('secure-share-created', {
        shareId,
        documentId,
        createdBy: userId,
        expiresAt: shareConfig.expiresAt,
        secureUrl
      });

      console.log('✅ Lien de partage sécurisé créé');
      return {
        success: true,
        shareId,
        secureUrl,
        expiresAt: shareConfig.expiresAt,
        maxDownloads: shareConfig.maxDownloads,
        requirePassword: shareConfig.requirePassword
      };

    } catch (error) {
      console.error('❌ Erreur création lien sécurisé:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🧬 ADVANCED DUPLICATE DETECTION
  // ═══════════════════════════════════════════════════════════════

  async detectAdvancedDuplicates(filename, content, metadata = {}) {
    try {
      console.log('🧬 Détection avancée de doublons...');

      // 1. Hash exact pour doublons identiques
      const contentHash = crypto.createHash('sha256').update(content).digest('hex');
      const exactDuplicates = await this.findDocumentsByHash(contentHash);

      // 2. Similarité sémantique avec embeddings
      const semanticSimilarity = await this.findSemanticSimilarDocuments(content, 0.85);

      // 3. Détection de versions basée sur le nom
      const versionSimilarity = await this.findVersionSimilarDocuments(filename);

      // 4. Analyse de contenu structurel
      const structuralSimilarity = await this.findStructuralSimilarDocuments(content);

      const duplicateAnalysis = {
        exactDuplicates: exactDuplicates.length > 0,
        exactMatches: exactDuplicates,
        semanticSimilarity: semanticSimilarity.length > 0,
        semanticMatches: semanticSimilarity,
        versionSimilarity: versionSimilarity.length > 0,
        versionMatches: versionSimilarity,
        structuralSimilarity: structuralSimilarity.length > 0,
        structuralMatches: structuralSimilarity,
        overallSimilarityScore: this.calculateOverallSimilarity(
          exactDuplicates, semanticSimilarity, versionSimilarity, structuralSimilarity
        ),
        recommendedAction: this.getRecommendedDuplicateAction(
          exactDuplicates, semanticSimilarity, versionSimilarity, structuralSimilarity
        ),
        confidence: 0.9
      };

      // Trigger n8n si doublons détectés
      if (duplicateAnalysis.overallSimilarityScore > 0.7) {
        await this.triggerN8nWorkflow('advanced-duplicate-detected', {
          filename,
          duplicateAnalysis,
          timestamp: new Date().toISOString()
        });
      }

      return duplicateAnalysis;

    } catch (error) {
      console.error('❌ Erreur détection avancée doublons:', error.message);
      return {
        exactDuplicates: false,
        semanticSimilarity: false,
        versionSimilarity: false,
        structuralSimilarity: false,
        overallSimilarityScore: 0.0,
        recommendedAction: 'keep_both',
        confidence: 0.0,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📜 COMPREHENSIVE AUDIT LOGGING
  // ═══════════════════════════════════════════════════════════════

  async logSecurityEvent(eventType, userId, documentId, action, metadata = {}) {
    try {
      const timestamp = new Date().toISOString();
      const eventId = crypto.randomUUID();

      const auditEntry = {
        eventId,
        timestamp,
        eventType,
        userId,
        documentId,
        action,
        userAgent: metadata.userAgent || 'unknown',
        ipAddress: metadata.ipAddress || 'unknown',
        sessionId: metadata.sessionId || 'unknown',
        success: metadata.success !== false,
        errorMessage: metadata.errorMessage || null,
        additionalData: metadata.additionalData || {}
      };

      // Sauvegarder dans le fichier d'audit
      const logLine = JSON.stringify(auditEntry) + '\n';
      await fs.appendFile(this.securityConfig.auditLogPath, logLine, 'utf8');

      // Sauvegarder aussi en base de données pour les requêtes
      await this.saveAuditEntry(auditEntry);

      // Analyser les patterns suspects
      await this.analyzeSuspiciousPatterns(userId, eventType, action);

      // Mettre à jour les métriques
      this.securityMetrics.totalAccess++;
      if (eventType === 'unauthorized_access_attempt') {
        this.securityMetrics.unauthorizedAttempts++;
      }

      return auditEntry;

    } catch (error) {
      console.error('❌ Erreur journalisation sécurité:', error.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔍 BEHAVIORAL ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  async analyzeSuspiciousPatterns(userId, eventType, action) {
    try {
      // Récupérer l'historique récent de l'utilisateur
      const recentEvents = await this.getRecentUserEvents(userId, 24); // 24 dernières heures

      // Patterns suspects à détecter
      const suspiciousPatterns = {
        rapidAccess: this.detectRapidAccess(recentEvents),
        unusualHours: this.detectUnusualHours(recentEvents),
        massDownload: this.detectMassDownload(recentEvents),
        privilegeEscalation: this.detectPrivilegeEscalation(recentEvents),
        geographicAnomaly: this.detectGeographicAnomaly(recentEvents)
      };

      // Si pattern suspect détecté, créer une alerte
      const suspiciousScore = Object.values(suspiciousPatterns).reduce((sum, pattern) => 
        sum + (pattern.detected ? pattern.severity : 0), 0
      );

      if (suspiciousScore > 5) {
        await this.createSecurityAlert({
          type: 'suspicious_behavior',
          userId,
          suspiciousScore,
          patterns: suspiciousPatterns,
          recommendedActions: this.getSecurityRecommendations(suspiciousPatterns)
        });
      }

      return suspiciousPatterns;

    } catch (error) {
      console.error('❌ Erreur analyse comportementale:', error.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ⏰ AUTOMATED EXPIRATION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  async performExpirationScan() {
    try {
      console.log('⏰ Scan automatique des expirations...');

      const today = new Date();
      const warningThreshold = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 jours

      // Récupérer tous les documents avec date d'expiration
      let documentsWithExpiration = [];
      try {
        documentsWithExpiration = await Document.find({
          expirationDate: { $exists: true, $ne: null }
        });
      } catch (error) {
        console.log('Document model not available, using empty array for expiration scan');
        documentsWithExpiration = [];
      }

      const expired = [];
      const expiringSoon = [];
      const renewed = [];

      for (const doc of documentsWithExpiration) {
        const expirationDate = new Date(doc.expirationDate);

        if (expirationDate < today) {
          // Document expiré
          expired.push(doc);
          await this.handleExpiredDocument(doc);
        } else if (expirationDate < warningThreshold) {
          // Document expire bientôt
          expiringSoon.push(doc);
          await this.sendExpirationWarning(doc);
        }

        // Vérifier si renouvellement automatique possible
        if (doc.autoRenewal && expirationDate < warningThreshold) {
          const renewalResult = await this.attemptAutoRenewal(doc);
          if (renewalResult.success) {
            renewed.push(doc);
          }
        }
      }

      // Générer rapport d'expiration
      const expirationReport = {
        scanDate: today.toISOString(),
        totalScanned: documentsWithExpiration.length,
        expired: expired.length,
        expiringSoon: expiringSoon.length,
        renewed: renewed.length,
        expiredDocuments: expired.map(doc => ({
          id: doc._id,
          name: doc.filename,
          expirationDate: doc.expirationDate,
          category: doc.category
        })),
        expiringSoonDocuments: expiringSoon.map(doc => ({
          id: doc._id,
          name: doc.filename,
          expirationDate: doc.expirationDate,
          daysUntilExpiration: Math.ceil((new Date(doc.expirationDate) - today) / (1000 * 60 * 60 * 24))
        }))
      };

      // Trigger n8n workflows
      if (expired.length > 0) {
        await this.triggerN8nWorkflow('documents-expired', expirationReport);
      }
      if (expiringSoon.length > 0) {
        await this.triggerN8nWorkflow('documents-expiring-soon', expirationReport);
      }

      console.log(`✅ Scan expiration terminé: ${expired.length} expirés, ${expiringSoon.length} bientôt expirés`);
      return expirationReport;

    } catch (error) {
      console.error('❌ Erreur scan expiration:', error.message);
      return {
        scanDate: new Date().toISOString(),
        error: error.message,
        totalScanned: 0,
        expired: 0,
        expiringSoon: 0
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔒 SECURITY MONITORING METHODS
  // ═══════════════════════════════════════════════════════════════

  async performSecurityScan() {
    try {
      console.log('🔒 Scan de sécurité périodique...');

      const scanResults = {
        timestamp: new Date().toISOString(),
        unauthorizedAccess: await this.scanUnauthorizedAccess(),
        suspiciousFiles: await this.scanSuspiciousFiles(),
        integrityCheck: await this.performIntegrityCheck(),
        accessAnomalies: await this.detectAccessAnomalies(),
        systemHealth: await this.checkSystemHealth()
      };

      // Calculer le score de sécurité global
      const securityScore = this.calculateSecurityScore(scanResults);
      scanResults.securityScore = securityScore;

      // Si score critique, déclencher alerte immédiate
      if (securityScore < 50) {
        await this.triggerN8nWorkflow('critical-security-alert', scanResults);
      }

      // Sauvegarder le rapport de scan
      await this.saveSecurityScanReport(scanResults);

      return scanResults;

    } catch (error) {
      console.error('❌ Erreur scan sécurité:', error.message);
      return {
        timestamp: new Date().toISOString(),
        error: error.message,
        securityScore: 0
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📤 DOCUMENT SAVE FUNCTIONALITY
  // ═══════════════════════════════════════════════════════════════

  // Upload functionality removed - saveClassifiedDocument method disabled

  // Upload functionality removed - getDocumentsByCategory method disabled

  /**
   * Formater la taille de fichier
   * @param {number} bytes - Taille en bytes
   * @returns {string} Taille formatée
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = DexoAgent;