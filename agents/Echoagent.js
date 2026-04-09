const { ChatGroq } = require("@langchain/groq");
const { PromptTemplate } = require("@langchain/core/prompts");
const { RunnableSequence } = require("@langchain/core/runnables");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { z } = require("zod");
const { StructuredOutputParser } = require("@langchain/core/output_parsers");
const Document = require('../models/Document');
const mongoose = require('mongoose');

class EchoAgent {
  constructor() {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
    });

    // Initialize LangChain components
    this.initializeChains();
    this.initializeDocumentChains();
  }

  initializeChains() {
    // ═══════════════════════════════════════════════════════════════
    // 🔍 BASIC ANALYSIS CHAIN
    // ═══════════════════════════════════════════════════════════════
    
    const basicAnalysisSchema = z.object({
      summary: z.string().describe("résumé en une phrase"),
      isUrgent: z.boolean().describe("true si urgent"),
      priority: z.enum(["high", "medium", "low"]).describe("niveau de priorité"),
      actions: z.array(z.string()).describe("liste des actions à faire"),
      category: z.enum(["meeting", "email", "request", "alert", "info"]).describe("catégorie du message"),
      confidence: z.number().min(0).max(1).describe("niveau de confiance")
    });

    this.basicAnalysisParser = StructuredOutputParser.fromZodSchema(basicAnalysisSchema);

    this.basicAnalysisPrompt = PromptTemplate.fromTemplate(`
Analyse ce message et réponds selon le format demandé:

Message: {message}
Expéditeur: {sender}

Règles d'analyse:
- isUrgent = true si le message contient: urgent, important, asap, critical, panne, down, alerte
- priority = high si isUrgent = true, sinon medium ou low selon l'importance
- actions = liste des choses concrètes à faire (max 3)
- category = catégorie la plus appropriée
- confidence = ton niveau de confiance dans cette analyse (0.0 à 1.0)

{format_instructions}
`);

    this.basicAnalysisChain = RunnableSequence.from([
      this.basicAnalysisPrompt,
      this.llm,
      this.basicAnalysisParser
    ]);

    // ═══════════════════════════════════════════════════════════════
    // 🤖 AUTO REPLY CHAIN
    // ═══════════════════════════════════════════════════════════════

    this.autoReplyPrompt = PromptTemplate.fromTemplate(`
Tu es un assistant IA professionnel. Génère une réponse automatique appropriée pour ce message:

Message original: {message}
Contexte: {context}
Analyse: {analysis}

Instructions:
- Réponse courte et professionnelle (max 2-3 phrases)
- Adaptée au contexte et au ton du message
- Si c'est une question, propose une réponse utile
- Si c'est une demande, confirme la réception et indique les prochaines étapes
- Si c'est urgent, rassure et donne un délai de traitement
- Utilise un ton approprié (formel/informel selon le contexte)

Réponds UNIQUEMENT avec le texte de la réponse, sans guillemets ni formatage.
`);

    this.autoReplyChain = RunnableSequence.from([
      this.autoReplyPrompt,
      this.llm,
      new StringOutputParser()
    ]);

    // ═══════════════════════════════════════════════════════════════
    // 🚨 ESCALATION CHECK CHAIN
    // ═══════════════════════════════════════════════════════════════

    const escalationSchema = z.object({
      shouldEscalate: z.boolean().describe("true si escalade nécessaire"),
      escalationLevel: z.enum(["low", "medium", "high", "critical"]).describe("niveau d'escalade"),
      reason: z.string().describe("raison détaillée de l'escalade"),
      suggestedDepartment: z.enum(["support", "technique", "commercial", "management", "legal"]).describe("département suggéré"),
      timeframe: z.enum(["immediate", "1hour", "4hours", "24hours"]).describe("délai de traitement"),
      confidence: z.number().min(0).max(1).describe("niveau de confiance")
    });

    this.escalationParser = StructuredOutputParser.fromZodSchema(escalationSchema);

    this.escalationPrompt = PromptTemplate.fromTemplate(`
Analyse si ce message nécessite une escalade vers un humain:

Message: {message}
Expéditeur: {sender}
Analyse de base: {basicAnalysis}

Critères d'escalade CRITIQUES:
- Problèmes techniques critiques (serveurs down, sécurité)
- Plaintes clients importantes ou menaces légales
- Demandes complexes nécessitant expertise humaine
- Situations d'urgence ou de crise
- Conflits interpersonnels ou tensions
- Demandes de remboursement/annulation importantes
- Violations de politique ou comportement inapproprié

Critères d'escalade MOYENS:
- Questions techniques complexes
- Demandes de personnalisation
- Problèmes récurrents
- Feedback négatif constructif

PAS d'escalade pour:
- Questions FAQ simples
- Demandes d'information standard
- Confirmations de routine
- Messages de remerciement

{format_instructions}
`);

    this.escalationChain = RunnableSequence.from([
      this.escalationPrompt,
      this.llm,
      this.escalationParser
    ]);

    // ═══════════════════════════════════════════════════════════════
    // 🔇 NOISE FILTER CHAIN
    // ═══════════════════════════════════════════════════════════════

    const noiseSchema = z.object({
      isNoise: z.boolean().describe("true si c'est du bruit"),
      noiseLevel: z.enum(["none", "low", "medium", "high"]).describe("niveau de bruit"),
      reason: z.string().describe("raison de la classification"),
      action: z.enum(["keep", "filter", "archive", "delete"]).describe("action recommandée"),
      confidence: z.number().min(0).max(1).describe("niveau de confiance")
    });

    this.noiseParser = StructuredOutputParser.fromZodSchema(noiseSchema);

    this.noisePrompt = PromptTemplate.fromTemplate(`
Détermine si ce message est du "bruit" (notification inutile, spam, contenu peu important):

Message: {message}
Expéditeur: {sender}

Critères de BRUIT ÉLEVÉ (action: delete/filter):
- Spam évident ou contenu promotionnel non sollicité
- Messages automatiques sans valeur (confirmations vides)
- Notifications système redondantes
- Contenu manifestement hors sujet

Critères de BRUIT MOYEN (action: archive):
- Notifications automatiques avec peu de valeur
- Messages répétitifs ou redondants
- Informations non critiques mais légitimes
- Confirmations automatiques simples

Critères de BRUIT FAIBLE (action: keep):
- Messages légitimes mais de faible priorité
- Informations utiles mais non urgentes

PAS de bruit (action: keep):
- Messages personnels ou professionnels légitimes
- Demandes d'information ou d'aide
- Communications importantes
- Contenu avec valeur actionnable

{format_instructions}
`);

    this.noiseChain = RunnableSequence.from([
      this.noisePrompt,
      this.llm,
      this.noiseParser
    ]);

    // ═══════════════════════════════════════════════════════════════
    // 📋 TASK EXTRACTION CHAIN
    // ═══════════════════════════════════════════════════════════════

    const taskSchema = z.object({
      title: z.string().describe("titre court de la tâche"),
      description: z.string().describe("description détaillée"),
      priority: z.enum(["high", "medium", "low"]).describe("priorité de la tâche"),
      assignee: z.string().nullable().describe("personne responsable ou null"),
      deadline: z.string().nullable().describe("échéance ou null"),
      category: z.enum(["meeting", "development", "communication", "admin", "research", "other"]).describe("catégorie"),
      status: z.literal("todo").describe("statut initial"),
      confidence: z.number().min(0).max(1).describe("confiance dans l'extraction")
    });

    const taskExtractionSchema = z.object({
      tasks: z.array(taskSchema).describe("liste des tâches extraites"),
      totalTasks: z.number().describe("nombre total de tâches"),
      confidence: z.number().min(0).max(1).describe("confiance globale")
    });

    this.taskParser = StructuredOutputParser.fromZodSchema(taskExtractionSchema);

    this.taskPrompt = PromptTemplate.fromTemplate(`
Extrait toutes les tâches concrètes et actions à faire depuis ce message:

Message: {message}
Contexte de conversation: {conversationContext}

Recherche des TÂCHES EXPLICITES:
- Verbes d'action: faire, créer, envoyer, appeler, organiser, planifier, réviser, etc.
- Demandes de travail ou de livraisons
- Échéances et deadlines mentionnées
- Responsabilités assignées explicitement
- Étapes de processus à suivre
- Suivis nécessaires ou rappels

Recherche des TÂCHES IMPLICITES:
- Problèmes mentionnés qui nécessitent une action
- Questions qui impliquent une recherche ou investigation
- Besoins exprimés qui nécessitent une réponse

IGNORE:
- Informations purement descriptives
- Événements passés sans action future
- Opinions ou commentaires sans action requise

Pour chaque tâche:
- title: résumé en 3-5 mots maximum
- description: explication claire de ce qui doit être fait
- assignee: nom de la personne si mentionnée, sinon null
- deadline: date/heure si mentionnée, sinon null
- category: catégorie la plus appropriée
- priority: basée sur l'urgence et l'importance dans le contexte

{format_instructions}
`);

    this.taskChain = RunnableSequence.from([
      this.taskPrompt,
      this.llm,
      this.taskParser
    ]);
  }

  // ═══════════════════════════════════════════════════════════════
  // 📄 DOCUMENT CLASSIFICATION CHAIN
  // ═══════════════════════════════════════════════════════════════

  initializeDocumentChains() {
    const documentClassificationSchema = z.object({
      category: z.enum(["Commercial", "Finance", "Juridique", "Marketing", "RH", "Technique"]).describe("catégorie principale du document"),
      confidentialityLevel: z.enum(["public", "interne", "confidentiel", "critique"]).describe("niveau de confidentialité"),
      summary: z.string().describe("résumé du contenu en 2-3 phrases"),
      keyTopics: z.array(z.string()).describe("sujets clés identifiés (max 5)"),
      documentType: z.enum(["contrat", "rapport", "email", "facture", "presentation", "manuel", "autre"]).describe("type de document"),
      urgency: z.enum(["low", "medium", "high"]).describe("niveau d'urgence"),
      confidence: z.number().min(0).max(1).describe("niveau de confiance dans la classification")
    });

    this.documentClassificationParser = StructuredOutputParser.fromZodSchema(documentClassificationSchema);

    this.documentClassificationPrompt = PromptTemplate.fromTemplate(`
Analyse et classifie ce document selon les critères suivants:

Contenu du document: {content}

CATÉGORIES DISPONIBLES:
- Commercial: ventes, clients, partenariats, marketing commercial
- Finance: budgets, comptabilité, factures, finances
- Juridique: contrats, accords légaux, conformité
- Marketing: campagnes, communication, branding
- RH: ressources humaines, recrutement, formation
- Technique: documentation technique, spécifications, développement

NIVEAUX DE CONFIDENTIALITÉ:
- public: accessible à tous
- interne: limité à l'organisation
- confidentiel: accès restreint
- critique: très sensible, accès minimal

TYPES DE DOCUMENTS:
- contrat: accords, conventions
- rapport: analyses, études
- email: correspondance
- facture: documents financiers
- presentation: supports de présentation
- manuel: documentation, guides
- autre: autres types

Analyse le contenu et détermine:
1. La catégorie la plus appropriée
2. Le niveau de confidentialité basé sur la sensibilité
3. Un résumé concis du contenu
4. Les sujets clés (mots-clés importants)
5. Le type de document
6. Le niveau d'urgence

{format_instructions}
`);

    this.documentClassificationChain = RunnableSequence.from([
      this.documentClassificationPrompt,
      this.llm,
      this.documentClassificationParser
    ]);
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔍 BASIC ANALYSIS METHOD
  // ═══════════════════════════════════════════════════════════════

  async analyze(message, sender = "unknown") {
    try {
      console.log('📤 Analyse de base avec LangChain...');
      
      const result = await this.basicAnalysisChain.invoke({
        message: message,
        sender: sender,
        format_instructions: this.basicAnalysisParser.getFormatInstructions()
      });

      console.log('✅ Analyse de base réussie');
      return result;
      
    } catch (error) {
      console.error("❌ Erreur analyse de base:", error.message);
      return {
        summary: message.substring(0, 100),
        isUrgent: false,
        priority: "low",
        actions: [],
        category: "info",
        confidence: 0.0,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🤖 AUTO REPLY METHOD
  // ═══════════════════════════════════════════════════════════════

  async generateAutoReply(message, context = {}, analysis = null) {
    try {
      console.log('🤖 Génération réponse auto avec LangChain...');
      
      const result = await this.autoReplyChain.invoke({
        message: message,
        context: JSON.stringify(context),
        analysis: analysis ? JSON.stringify(analysis) : "Non disponible"
      });

      return result.trim();
      
    } catch (error) {
      console.error("❌ Erreur génération réponse auto:", error.message);
      return "Merci pour votre message. Nous vous répondrons dans les plus brefs délais.";
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 💡 RESPONSE SUGGESTIONS METHOD
  // ═══════════════════════════════════════════════════════════════

  async generateResponseSuggestions(message, sender = "unknown", context = {}, analysis = null) {
    try {
      console.log('💡 Génération de suggestions de réponses avec LangChain...');
      
      const suggestionsPrompt = PromptTemplate.fromTemplate(`
Tu es un assistant IA professionnel. Génère 3 suggestions de réponses différentes pour ce message:

Message original: {message}
Expéditeur: {sender}
Contexte: {context}
Analyse: {analysis}

Instructions:
- Génère exactement 3 réponses différentes avec des tons et approches variés
- Réponse 1: Formelle et professionnelle
- Réponse 2: Amicale et décontractée
- Réponse 3: Concise et directe
- Chaque réponse doit être adaptée au contenu du message
- Maximum 2-3 phrases par réponse
- Si c'est une question, propose des réponses utiles
- Si c'est une demande, confirme et indique les prochaines étapes

Format de réponse (JSON):
{
  "suggestions": [
    {
      "type": "formal",
      "title": "Réponse formelle",
      "content": "texte de la réponse formelle"
    },
    {
      "type": "friendly",
      "title": "Réponse amicale", 
      "content": "texte de la réponse amicale"
    },
    {
      "type": "concise",
      "title": "Réponse concise",
      "content": "texte de la réponse concise"
    }
  ]
}

Réponds UNIQUEMENT avec le JSON, sans formatage markdown.
`);

      const suggestionsChain = RunnableSequence.from([
        suggestionsPrompt,
        this.llm,
        new StringOutputParser()
      ]);

      const result = await suggestionsChain.invoke({
        message: message,
        sender: sender,
        context: JSON.stringify(context),
        analysis: analysis ? JSON.stringify(analysis) : "Non disponible"
      });

      // Parse the JSON response
      try {
        const parsed = JSON.parse(result.trim());
        return parsed.suggestions || [];
      } catch (parseError) {
        console.error("❌ Erreur parsing suggestions:", parseError.message);
        // Fallback suggestions
        return [
          {
            type: "formal",
            title: "Réponse formelle",
            content: "Merci pour votre message. Nous avons bien reçu votre demande et nous vous répondrons dans les plus brefs délais."
          },
          {
            type: "friendly",
            title: "Réponse amicale",
            content: "Salut ! Merci pour ton message. Je vais regarder ça et te revenir rapidement."
          },
          {
            type: "concise",
            title: "Réponse concise",
            content: "Message reçu. Traitement en cours."
          }
        ];
      }
      
    } catch (error) {
      console.error("❌ Erreur génération suggestions:", error.message);
      // Return fallback suggestions
      return [
        {
          type: "formal",
          title: "Réponse formelle",
          content: "Merci pour votre message. Nous vous répondrons dans les plus brefs délais."
        },
        {
          type: "friendly", 
          title: "Réponse amicale",
          content: "Merci pour votre message ! Nous allons traiter votre demande rapidement."
        },
        {
          type: "concise",
          title: "Réponse concise",
          content: "Message reçu. Traitement en cours."
        }
      ];
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🚨 ESCALATION CHECK METHOD
  // ═══════════════════════════════════════════════════════════════

  async checkEscalation(message, sender, basicAnalysis = null) {
    try {
      console.log('🚨 Vérification escalade avec LangChain...');
      
      const result = await this.escalationChain.invoke({
        message: message,
        sender: sender,
        basicAnalysis: basicAnalysis ? JSON.stringify(basicAnalysis) : "Non disponible",
        format_instructions: this.escalationParser.getFormatInstructions()
      });

      return result;
      
    } catch (error) {
      console.error("❌ Erreur vérification escalade:", error.message);
      return {
        shouldEscalate: false,
        escalationLevel: "low",
        reason: "Erreur d'analyse",
        suggestedDepartment: "support",
        timeframe: "24hours",
        confidence: 0.0
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔇 NOISE FILTER METHOD
  // ═══════════════════════════════════════════════════════════════

  async filterNoise(message, sender) {
    try {
      console.log('🔇 Filtrage bruit avec LangChain...');
      
      const result = await this.noiseChain.invoke({
        message: message,
        sender: sender,
        format_instructions: this.noiseParser.getFormatInstructions()
      });

      return result;
      
    } catch (error) {
      console.error("❌ Erreur filtrage bruit:", error.message);
      return {
        isNoise: false,
        noiseLevel: "none",
        reason: "Erreur d'analyse",
        action: "keep",
        confidence: 0.0
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📋 TASK EXTRACTION METHOD
  // ═══════════════════════════════════════════════════════════════

  async extractTasks(message, conversationContext = []) {
    try {
      console.log('📋 Extraction tâches avec LangChain...');
      
      const contextStr = conversationContext.length > 0 
        ? conversationContext.map(msg => `- ${msg}`).join('\n')
        : 'Aucun contexte disponible';

      const result = await this.taskChain.invoke({
        message: message,
        conversationContext: contextStr,
        format_instructions: this.taskParser.getFormatInstructions()
      });

      return result;
      
    } catch (error) {
      console.error("❌ Erreur extraction tâches:", error.message);
      return {
        tasks: [],
        totalTasks: 0,
        confidence: 0.0,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔄 FULL ANALYSIS WITH LANGCHAIN ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════

  async fullAnalysis(message, sender = "unknown", context = {}) {
    try {
      console.log('🔍 Analyse complète avec orchestration LangChain...');
      const startTime = Date.now();
      
      // 1. Analyse de base (obligatoire)
      const basicAnalysis = await this.analyze(message, sender);
      
      // 2. Exécution en parallèle des autres analyses
      const [autoReply, escalation, noiseFilter, taskExtraction] = await Promise.all([
        this.generateAutoReply(message, context, basicAnalysis),
        this.checkEscalation(message, sender, basicAnalysis),
        this.filterNoise(message, sender),
        this.extractTasks(message, context.conversationHistory || [])
      ]);
      
      const processingTime = Date.now() - startTime;
      
      // 3. Résultat combiné avec métadonnées LangChain
      const fullResult = {
        // Analyse de base
        ...basicAnalysis,
        
        // Fonctionnalités avancées
        autoReply: autoReply,
        escalation: escalation,
        noiseFilter: noiseFilter,
        taskExtraction: taskExtraction,
        
        // Métadonnées
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: processingTime,
          langchainVersion: "0.1.0",
          model: "llama-3.3-70b-versatile",
          provider: "groq"
        },
        
        // Recommandations basées sur l'analyse
        recommendations: this.generateRecommendations(basicAnalysis, escalation, noiseFilter, taskExtraction)
      };
      
      console.log(`✅ Analyse complète terminée en ${processingTime}ms`);
      return fullResult;
      
    } catch (error) {
      console.error("❌ Erreur analyse complète:", error.message);
      return {
        summary: "Erreur d'analyse complète",
        isUrgent: false,
        priority: "low",
        actions: [],
        category: "error",
        autoReply: null,
        escalation: { shouldEscalate: false },
        noiseFilter: { isNoise: false },
        taskExtraction: { tasks: [] },
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: 0,
          langchainVersion: "0.1.0"
        }
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 💡 GENERATE RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════

  generateRecommendations(basicAnalysis, escalation, noiseFilter, taskExtraction) {
    const recommendations = [];

    // Recommandations basées sur l'urgence
    if (basicAnalysis.isUrgent) {
      recommendations.push({
        type: "urgency",
        action: "immediate_attention",
        message: "Ce message nécessite une attention immédiate",
        priority: "high"
      });
    }

    // Recommandations d'escalade
    if (escalation.shouldEscalate) {
      recommendations.push({
        type: "escalation",
        action: "escalate_to_human",
        message: `Escalader vers ${escalation.suggestedDepartment} dans ${escalation.timeframe}`,
        priority: escalation.escalationLevel
      });
    }

    // Recommandations de filtrage
    if (noiseFilter.isNoise && noiseFilter.noiseLevel !== "none") {
      recommendations.push({
        type: "noise_filter",
        action: noiseFilter.action,
        message: `Action recommandée: ${noiseFilter.action} - ${noiseFilter.reason}`,
        priority: "low"
      });
    }

    // Recommandations de tâches
    if (taskExtraction.tasks && taskExtraction.tasks.length > 0) {
      recommendations.push({
        type: "task_management",
        action: "create_tasks",
        message: `${taskExtraction.totalTasks} tâche(s) identifiée(s) à créer`,
        priority: "medium"
      });
    }

    return recommendations;
  }

  // ═══════════════════════════════════════════════════════════════
  // 🧪 BATCH PROCESSING WITH LANGCHAIN
  // ═══════════════════════════════════════════════════════════════

  async batchAnalysis(messages, options = {}) {
    try {
      console.log(`📦 Analyse en lot de ${messages.length} messages avec LangChain...`);
      
      const { 
        includeFullAnalysis = false, 
        maxConcurrency = 3,
        includeRecommendations = true 
      } = options;

      // Traitement par lots pour éviter la surcharge
      const results = [];
      for (let i = 0; i < messages.length; i += maxConcurrency) {
        const batch = messages.slice(i, i + maxConcurrency);
        
        const batchResults = await Promise.all(
          batch.map(async (msg, index) => {
            try {
              const analysis = includeFullAnalysis 
                ? await this.fullAnalysis(msg.message, msg.sender, msg.context || {})
                : await this.analyze(msg.message, msg.sender);
              
              return {
                index: i + index,
                message: msg.message.substring(0, 50) + "...",
                sender: msg.sender,
                analysis: analysis,
                success: true
              };
            } catch (error) {
              return {
                index: i + index,
                message: msg.message.substring(0, 50) + "...",
                sender: msg.sender,
                error: error.message,
                success: false
              };
            }
          })
        );
        
        results.push(...batchResults);
      }

      return {
        success: true,
        total: messages.length,
        processed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results,
        metadata: {
          timestamp: new Date().toISOString(),
          langchainVersion: "0.1.0",
          batchSize: maxConcurrency
        }
      };
      
    } catch (error) {
      console.error("❌ Erreur analyse en lot:", error.message);
      return {
        success: false,
        error: error.message,
        total: messages.length,
        processed: 0,
        failed: messages.length
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📄 DOCUMENT MANAGEMENT METHODS
  // ═══════════════════════════════════════════════════════════════

  async classifyDocument(content, userId = 'current_user') {
    try {
      console.log('📄 Classification de document avec LangChain...');
      
      const result = await this.documentClassificationChain.invoke({
        content: content,
        format_instructions: this.documentClassificationParser.getFormatInstructions()
      });

      console.log('✅ Classification de document réussie');
      return {
        success: true,
        classification: result,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error("❌ Erreur classification document:", error.message);
      return {
        success: false,
        error: error.message,
        classification: {
          category: "Technique",
          confidentialityLevel: "interne",
          summary: "Erreur lors de la classification",
          keyTopics: [],
          documentType: "autre",
          urgency: "low",
          confidence: 0.0
        }
      };
    }
  }

  async saveClassifiedDocument(content, classification, userId = 'current_user') {
    try {
      console.log('💾 Sauvegarde du document classifié...');
      
      // Ensure database connection
      if (mongoose.connection.readyState !== 1) {
        console.log('🔌 Connexion à la base de données...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/integration_mobile');
      }

      // Create document with required fields
      const document = new Document({
        originalName: `echo_document_${Date.now()}.txt`,
        filePath: `/documents/classified/${classification.category}/${classification.confidentialityLevel}/`,
        mimetype: 'text/plain',
        size: content.length,
        hash: require('crypto').createHash('md5').update(content).digest('hex'),
        uploadedBy: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'), // Mock user ID
        category: classification.category,
        confidentiality: classification.confidentialityLevel,
        content: content,
        summary: classification.summary,
        keyTopics: classification.keyTopics || [],
        documentType: classification.documentType || 'autre',
        urgency: classification.urgency || 'low',
        confidence: classification.confidence || 0.0,
        processedBy: 'echo',
        metadata: {
          classification: classification,
          processedAt: new Date(),
          agent: 'echo'
        }
      });

      const savedDocument = await document.save();
      console.log('✅ Document sauvegardé avec succès:', savedDocument._id);

      return {
        success: true,
        documentId: savedDocument._id,
        message: 'Document classifié et sauvegardé avec succès'
      };

    } catch (error) {
      console.error('❌ Erreur sauvegarde document:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getDocumentsByCategory(category, confidentialityLevel = null, userId = 'current_user') {
    try {
      console.log(`📂 Récupération des documents - Catégorie: ${category}`);
      
      // Ensure database connection
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/integration_mobile');
      }

      let query = { 
        category: category,
        processedBy: 'echo'
      };
      
      if (confidentialityLevel) {
        query.confidentiality = confidentialityLevel;
      }

      const documents = await Document.find(query)
        .sort({ createdAt: -1 })
        .select('originalName category confidentiality summary keyTopics documentType urgency createdAt size')
        .lean();

      console.log(`✅ ${documents.length} documents trouvés`);

      return {
        success: true,
        documents: documents.map(doc => ({
          id: doc._id,
          name: doc.originalName,
          category: doc.category,
          confidentialityLevel: doc.confidentiality,
          summary: doc.summary,
          keyTopics: doc.keyTopics || [],
          documentType: doc.documentType,
          urgency: doc.urgency,
          createdAt: doc.createdAt,
          size: doc.size
        }))
      };

    } catch (error) {
      console.error('❌ Erreur récupération documents:', error);
      return {
        success: false,
        error: error.message,
        documents: []
      };
    }
  }

  async getDocumentContent(documentId, userId = 'current_user') {
    try {
      console.log(`📖 Récupération du contenu du document: ${documentId}`);
      
      // Ensure database connection
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/integration_mobile');
      }

      const document = await Document.findOne({ 
        _id: documentId,
        processedBy: 'echo'
      }).lean();

      if (!document) {
        return {
          success: false,
          error: 'Document non trouvé'
        };
      }

      console.log('✅ Contenu du document récupéré');

      return {
        success: true,
        document: {
          id: document._id,
          name: document.originalName,
          content: document.content,
          category: document.category,
          confidentialityLevel: document.confidentiality,
          summary: document.summary,
          keyTopics: document.keyTopics || [],
          documentType: document.documentType,
          urgency: document.urgency,
          createdAt: document.createdAt,
          size: document.size,
          metadata: document.metadata
        }
      };

    } catch (error) {
      console.error('❌ Erreur récupération contenu:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📋 TASK MANAGEMENT METHODS
  // ═══════════════════════════════════════════════════════════════

  async extractAndSaveTasks(message, sender = "unknown", emailId = null, subject = null, userId = 'current_user') {
    try {
      console.log('📋 Extraction et sauvegarde des tâches...');
      
      // Extract tasks using AI
      const extraction = await this.extractTasks(message, []);
      
      if (!extraction.tasks || extraction.tasks.length === 0) {
        return {
          success: true,
          message: 'Aucune tâche détectée dans ce message',
          tasks: [],
          totalExtracted: 0
        };
      }

      const Task = require('../models/Task');
      const savedTasks = [];

      // Save each extracted task
      for (const taskData of extraction.tasks) {
        try {
          const task = new Task({
            title: taskData.title,
            description: taskData.description,
            assignee: taskData.assignee,
            deadline: taskData.deadline ? new Date(taskData.deadline) : null,
            category: taskData.category,
            priority: taskData.priority,
            confidence: taskData.confidence,
            extractedFrom: {
              emailId: emailId,
              sender: sender,
              subject: subject,
              extractedAt: new Date()
            },
            userId: userId
          });

          const savedTask = await task.save();
          savedTasks.push(savedTask);
          console.log(`✅ Tâche sauvegardée: ${savedTask.title}`);
        } catch (saveError) {
          console.error(`❌ Erreur sauvegarde tâche "${taskData.title}":`, saveError.message);
        }
      }

      return {
        success: true,
        message: `${savedTasks.length} tâche(s) extraite(s) et sauvegardée(s)`,
        tasks: savedTasks,
        totalExtracted: savedTasks.length,
        confidence: extraction.confidence
      };

    } catch (error) {
      console.error("❌ Erreur extraction et sauvegarde tâches:", error.message);
      return {
        success: false,
        error: error.message,
        tasks: [],
        totalExtracted: 0
      };
    }
  }

  async getTasks(userId = 'current_user', status = null, category = null) {
    try {
      console.log(`📋 Récupération des tâches - User: ${userId}, Status: ${status}, Category: ${category}`);
      
      const Task = require('../models/Task');
      let query = { userId };
      
      if (status) {
        query.status = status;
      }
      
      if (category) {
        query.category = category;
      }

      const tasks = await Task.find(query)
        .sort({ 
          priority: -1, // High priority first
          createdAt: -1  // Most recent first
        });

      // Group tasks by status for better organization
      const groupedTasks = {
        todo: tasks.filter(t => t.status === 'todo'),
        in_progress: tasks.filter(t => t.status === 'in_progress'),
        completed: tasks.filter(t => t.status === 'completed'),
        cancelled: tasks.filter(t => t.status === 'cancelled')
      };

      // Get overdue tasks
      const overdueTasks = await Task.getOverdueTasks(userId);

      return {
        success: true,
        tasks: tasks,
        groupedTasks: groupedTasks,
        overdueTasks: overdueTasks,
        totalTasks: tasks.length,
        stats: {
          todo: groupedTasks.todo.length,
          in_progress: groupedTasks.in_progress.length,
          completed: groupedTasks.completed.length,
          overdue: overdueTasks.length
        }
      };

    } catch (error) {
      console.error("❌ Erreur récupération tâches:", error.message);
      return {
        success: false,
        error: error.message,
        tasks: [],
        totalTasks: 0
      };
    }
  }

  async updateTaskStatus(taskId, newStatus, userId = 'current_user') {
    try {
      console.log(`📋 Mise à jour statut tâche: ${taskId} -> ${newStatus}`);
      
      const Task = require('../models/Task');
      const task = await Task.findOne({ _id: taskId, userId });

      if (!task) {
        return {
          success: false,
          error: 'Tâche non trouvée'
        };
      }

      await task.updateStatus(newStatus);

      return {
        success: true,
        message: `Statut mis à jour: ${newStatus}`,
        task: task
      };

    } catch (error) {
      console.error("❌ Erreur mise à jour statut tâche:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteTask(taskId, userId = 'current_user') {
    try {
      console.log(`📋 Suppression tâche: ${taskId}`);
      
      const Task = require('../models/Task');
      const result = await Task.deleteOne({ _id: taskId, userId });

      if (result.deletedCount === 0) {
        return {
          success: false,
          error: 'Tâche non trouvée'
        };
      }

      return {
        success: true,
        message: 'Tâche supprimée avec succès'
      };

    } catch (error) {
      console.error("❌ Erreur suppression tâche:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new EchoAgent();