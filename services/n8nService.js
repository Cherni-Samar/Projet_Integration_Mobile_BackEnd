const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class N8nService {
  constructor() {
    this.baseUrl = process.env.N8N_URL || 'http://localhost:5678';
    this.webhookPath = '/webhook';
    this.apiKey = process.env.N8N_API_KEY || null;
    this.timeout = parseInt(process.env.N8N_TIMEOUT) || 30000;
    this.maxRetries = 3;
    this.retryDelay = 1000;
    
    // Configuration des workflows
    this.workflows = {
      'document-classified': `${this.baseUrl}${this.webhookPath}/document-classified`,
      'document-searched': `${this.baseUrl}${this.webhookPath}/document-searched`,
      'security-alert': `${this.baseUrl}${this.webhookPath}/security-alert`,
      'duplicate-detected': `${this.baseUrl}${this.webhookPath}/duplicate-detected`,
      'version-created': `${this.baseUrl}${this.webhookPath}/version-created`,
      'documents-expired': `${this.baseUrl}${this.webhookPath}/documents-expired`,
      'documents-expiring-soon': `${this.baseUrl}${this.webhookPath}/documents-expiring-soon`,
      'document-generated': `${this.baseUrl}${this.webhookPath}/document-generated`,
      'document-processed': `${this.baseUrl}${this.webhookPath}/document-processed`
    };
    
    console.log('🔗 N8n Service initialized');
    console.log(`   Base URL: ${this.baseUrl}`);
    console.log(`   Workflows: ${Object.keys(this.workflows).length} configured`);
  }

  /**
   * Déclenche un workflow n8n spécifique
   * @param {string} workflowName - Nom du workflow
   * @param {object} data - Données à envoyer
   * @param {object} options - Options supplémentaires
   * @returns {Promise<object>} Résultat du workflow
   */
  async triggerWorkflow(workflowName, data, options = {}) {
    try {
      const webhookUrl = this.workflows[workflowName];
      if (!webhookUrl) {
        throw new Error(`Workflow '${workflowName}' non configuré`);
      }

      const payload = {
        agent: 'dexo',
        workflow: workflowName,
        data: data,
        timestamp: new Date().toISOString(),
        ...options
      };

      console.log(`🔗 Déclenchement workflow n8n: ${workflowName}`);
      
      const response = await this.makeRequest(webhookUrl, payload);
      
      console.log(`✅ Workflow '${workflowName}' déclenché avec succès`);
      return {
        success: true,
        workflow: workflowName,
        response: response.data,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Erreur workflow '${workflowName}':`, error.message);
      return {
        success: false,
        workflow: workflowName,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Effectue une requête HTTP avec retry automatique
   * @param {string} url - URL de destination
   * @param {object} payload - Données à envoyer
   * @param {number} retryCount - Nombre de tentatives restantes
   * @returns {Promise<object>} Réponse HTTP
   */
  async makeRequest(url, payload, retryCount = this.maxRetries) {
    try {
      const config = {
        method: 'POST',
        url: url,
        data: payload,
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Dexo-Agent/1.0'
        }
      };

      // Ajouter l'authentification si configurée
      if (this.apiKey) {
        config.headers['X-API-Key'] = this.apiKey;
      }

      const response = await axios(config);
      return response;

    } catch (error) {
      if (retryCount > 0 && this.shouldRetry(error)) {
        console.log(`⚠️ Retry ${this.maxRetries - retryCount + 1}/${this.maxRetries} pour ${url}`);
        await this.delay(this.retryDelay * (this.maxRetries - retryCount + 1));
        return this.makeRequest(url, payload, retryCount - 1);
      }
      throw error;
    }
  }

  /**
   * Détermine si une erreur justifie un retry
   * @param {Error} error - Erreur à analyser
   * @returns {boolean} True si retry recommandé
   */
  shouldRetry(error) {
    if (!error.response) {
      // Erreurs réseau (timeout, connexion refusée, etc.)
      return true;
    }

    const status = error.response.status;
    // Retry pour les erreurs serveur (5xx) et certaines erreurs client
    return status >= 500 || status === 429 || status === 408;
  }

  /**
   * Délai d'attente
   * @param {number} ms - Millisecondes d'attente
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Déclenche un workflow de classification de document
   * @param {string} filename - Nom du fichier
   * @param {object} classification - Résultat de classification
   * @returns {Promise<object>}
   */
  async triggerDocumentClassified(filename, classification) {
    return this.triggerWorkflow('document-classified', {
      filename,
      classification,
      processingTime: classification.processingTime || 0
    });
  }

  /**
   * Déclenche un workflow de recherche de document
   * @param {string} query - Requête de recherche
   * @param {string} userRole - Rôle de l'utilisateur
   * @param {object} searchParams - Paramètres de recherche
   * @param {number} resultsCount - Nombre de résultats
   * @returns {Promise<object>}
   */
  async triggerDocumentSearched(query, userRole, searchParams, resultsCount) {
    return this.triggerWorkflow('document-searched', {
      query,
      userRole,
      searchParams,
      resultsCount
    });
  }

  /**
   * Déclenche un workflow d'alerte sécurité
   * @param {object} alert - Détails de l'alerte
   * @param {string} user - Utilisateur concerné
   * @param {string} document - Document concerné
   * @param {string} action - Action tentée
   * @returns {Promise<object>}
   */
  async triggerSecurityAlert(alert, user, document, action) {
    return this.triggerWorkflow('security-alert', {
      alert,
      user,
      document,
      action,
      severity: alert.alertLevel,
      requiresImmedateAction: alert.alertLevel === 'critical' || alert.alertLevel === 'emergency'
    });
  }

  /**
   * Déclenche un workflow de détection de doublon
   * @param {string} filename - Nom du fichier
   * @param {object} duplicateAnalysis - Résultat de l'analyse
   * @returns {Promise<object>}
   */
  async triggerDuplicateDetected(filename, duplicateAnalysis) {
    return this.triggerWorkflow('duplicate-detected', {
      filename,
      duplicateAnalysis,
      actionRequired: duplicateAnalysis.isDuplicate
    });
  }

  /**
   * Déclenche un workflow de création de version
   * @param {string} filename - Nom du fichier
   * @param {string} versionId - ID de la version
   * @param {object} versionMetadata - Métadonnées de version
   * @returns {Promise<object>}
   */
  async triggerVersionCreated(filename, versionId, versionMetadata) {
    return this.triggerWorkflow('version-created', {
      filename,
      versionId,
      versionMetadata,
      versionNumber: versionMetadata.version || 1
    });
  }

  /**
   * Déclenche un workflow pour documents expirés
   * @param {Array} expiredDocuments - Liste des documents expirés
   * @returns {Promise<object>}
   */
  async triggerDocumentsExpired(expiredDocuments) {
    return this.triggerWorkflow('documents-expired', {
      expiredDocuments,
      count: expiredDocuments.length,
      urgency: 'high'
    });
  }

  /**
   * Déclenche un workflow pour documents bientôt expirés
   * @param {Array} soonToExpire - Liste des documents bientôt expirés
   * @returns {Promise<object>}
   */
  async triggerDocumentsExpiringSoon(soonToExpire) {
    return this.triggerWorkflow('documents-expiring-soon', {
      soonToExpire,
      count: soonToExpire.length,
      urgency: 'medium'
    });
  }

  /**
   * Déclenche un workflow de génération de document
   * @param {string} filename - Nom du fichier généré
   * @param {string} documentType - Type de document
   * @param {object} classification - Classification du document
   * @returns {Promise<object>}
   */
  async triggerDocumentGenerated(filename, documentType, classification) {
    return this.triggerWorkflow('document-generated', {
      filename,
      documentType,
      classification,
      autoGenerated: true
    });
  }

  /**
   * Déclenche un workflow de traitement complet de document
   * @param {object} processingResult - Résultat du traitement complet
   * @returns {Promise<object>}
   */
  async triggerDocumentProcessed(processingResult) {
    return this.triggerWorkflow('document-processed', {
      ...processingResult,
      processingComplete: true,
      recommendationsCount: processingResult.recommendations?.length || 0
    });
  }

  /**
   * Déclenche plusieurs workflows en parallèle
   * @param {Array} workflows - Liste des workflows à déclencher
   * @returns {Promise<Array>} Résultats des workflows
   */
  async triggerMultipleWorkflows(workflows) {
    try {
      console.log(`🔗 Déclenchement de ${workflows.length} workflows en parallèle`);
      
      const promises = workflows.map(({ workflowName, data, options }) =>
        this.triggerWorkflow(workflowName, data, options)
      );

      const results = await Promise.allSettled(promises);
      
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;
      
      console.log(`✅ Workflows terminés: ${successful} succès, ${failed} échecs`);
      
      return results.map(result => 
        result.status === 'fulfilled' ? result.value : { success: false, error: result.reason }
      );

    } catch (error) {
      console.error('❌ Erreur workflows multiples:', error.message);
      return workflows.map(() => ({ success: false, error: error.message }));
    }
  }

  /**
   * Vérifie la connectivité avec n8n
   * @returns {Promise<object>} Statut de la connexion
   */
  async checkConnection() {
    try {
      const testUrl = `${this.baseUrl}/healthz`;
      const response = await axios.get(testUrl, { timeout: 5000 });
      
      return {
        connected: true,
        status: response.status,
        message: 'n8n accessible',
        baseUrl: this.baseUrl
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        message: 'n8n non accessible',
        baseUrl: this.baseUrl
      };
    }
  }

  /**
   * Obtient les statistiques des workflows
   * @returns {Promise<object>} Statistiques
   */
  async getWorkflowStats() {
    // En production, ceci pourrait interroger l'API n8n pour obtenir des statistiques
    return {
      totalWorkflows: Object.keys(this.workflows).length,
      configuredWorkflows: this.workflows,
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    };
  }

  /**
   * Charge la configuration des workflows depuis un fichier
   * @param {string} configPath - Chemin vers le fichier de configuration
   * @returns {Promise<void>}
   */
  async loadWorkflowConfig(configPath) {
    try {
      const configFile = path.resolve(configPath);
      const configData = await fs.readFile(configFile, 'utf8');
      const config = JSON.parse(configData);
      
      if (config.workflows) {
        // Mettre à jour les URLs des workflows
        Object.keys(config.workflows).forEach(workflowName => {
          const workflow = config.workflows[workflowName];
          if (workflow.webhook) {
            this.workflows[workflowName] = `${this.baseUrl}${workflow.webhook}`;
          }
        });
      }
      
      if (config.configuration) {
        // Mettre à jour la configuration
        this.baseUrl = config.configuration.n8n_base_url || this.baseUrl;
        this.timeout = config.configuration.timeout || this.timeout;
        if (config.configuration.retry_policy) {
          this.maxRetries = config.configuration.retry_policy.max_retries || this.maxRetries;
          this.retryDelay = config.configuration.retry_policy.retry_delay || this.retryDelay;
        }
      }
      
      console.log(`✅ Configuration n8n chargée depuis ${configPath}`);
      console.log(`   Workflows configurés: ${Object.keys(this.workflows).length}`);
      
    } catch (error) {
      console.error(`❌ Erreur chargement configuration n8n:`, error.message);
    }
  }
}

module.exports = new N8nService();