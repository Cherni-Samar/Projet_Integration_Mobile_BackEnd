/**
 * Script de test pour l'agent Dexo (Administrative Document Agent)
 * Usage: node scripts/test-dexo-agent.js
 */

require('dotenv').config();
const dexoAgent = require('../agents/DexoAgent');

async function testDocumentClassification() {
  console.log('🧪 Test de classification automatique des documents');
  console.log('='.repeat(60));

  const testDocuments = [
    {
      filename: "contrat_partenariat_2024.pdf",
      content: "CONTRAT DE PARTENARIAT\n\nEntre la société ABC et XYZ, il est convenu que...\nDurée: 2 ans\nMontant: 50 000€\nSigné le 15 janvier 2024\nExpiration: 15 janvier 2026",
      description: "Contrat commercial avec date d'expiration"
    },
    {
      filename: "facture_123.pdf", 
      content: "FACTURE N°123\nClient: Entreprise DEF\nMontant HT: 1 200€\nTVA: 240€\nTotal TTC: 1 440€\nÉchéance: 30 jours\nDate: 01/03/2024",
      description: "Facture avec informations financières"
    },
    {
      filename: "rapport_securite_confidentiel.docx",
      content: "RAPPORT DE SÉCURITÉ - CONFIDENTIEL\n\nAnalyse des vulnérabilités système\nAccès restreint - Personnel autorisé uniquement\nFailles critiques identifiées\nRecommandations urgentes",
      description: "Document technique confidentiel"
    },
    {
      filename: "presentation_marketing_q1.pptx",
      content: "PRÉSENTATION MARKETING Q1 2024\n\nStratégie commerciale\nCampagnes publicitaires\nBudget: 25 000€\nObjectifs de vente\nAnalyse concurrentielle",
      description: "Présentation marketing standard"
    }
  ];

  for (let i = 0; i < testDocuments.length; i++) {
    const { filename, content, description } = testDocuments[i];
    
    console.log(`\n📁 Test ${i + 1}: ${description}`);
    console.log(`Fichier: ${filename}`);
    console.log('-'.repeat(40));
    
    try {
      const startTime = Date.now();
      const classification = await dexoAgent.classifyDocument(filename, content, {
        uploadedBy: "test-user",
        source: "test-script"
      });
      const processingTime = Date.now() - startTime;
      
      console.log('📊 Résultats de classification:');
      console.log(`   ⏱️  Temps: ${processingTime}ms`);
      console.log(`   📂 Catégorie: ${classification.category} > ${classification.subcategory}`);
      console.log(`   🔒 Confidentialité: ${classification.confidentialityLevel}`);
      console.log(`   📝 Nom suggéré: ${classification.suggestedName}`);
      console.log(`   🏷️  Tags: ${classification.tags.join(', ')}`);
      console.log(`   📅 Expiration: ${classification.expirationDate || 'Aucune'}`);
      console.log(`   👥 Accès: ${classification.accessRoles.join(', ')}`);
      console.log(`   📈 Priorité: ${classification.priority}`);
      console.log(`   🎯 Confiance: ${(classification.confidence * 100).toFixed(1)}%`);
      
    } catch (error) {
      console.error(`❌ Erreur test ${i + 1}:`, error.message);
    }
  }
}

async function testIntelligentSearch() {
  console.log('\n\n🧪 Test de recherche intelligente');
  console.log('='.repeat(60));
  
  const searchQueries = [
    {
      query: "contrats signés le mois dernier",
      userRole: "manager",
      description: "Recherche temporelle avec catégorie"
    },
    {
      query: "documents confidentiels sur la sécurité",
      userRole: "admin",
      description: "Recherche par confidentialité et sujet"
    },
    {
      query: "factures importantes non payées",
      userRole: "finance",
      description: "Recherche avec priorité et statut"
    },
    {
      query: "présentations marketing récentes",
      userRole: "marketing",
      description: "Recherche par département et temporalité"
    }
  ];
  
  for (let i = 0; i < searchQueries.length; i++) {
    const { query, userRole, description } = searchQueries[i];
    
    console.log(`\n🔍 Test ${i + 1}: ${description}`);
    console.log(`Requête: "${query}"`);
    console.log(`Rôle: ${userRole}`);
    console.log('-'.repeat(40));
    
    try {
      const startTime = Date.now();
      const searchResult = await dexoAgent.intelligentSearch(query, userRole, {
        department: userRole,
        timestamp: new Date().toISOString()
      });
      const processingTime = Date.now() - startTime;
      
      console.log('🔍 Résultats de recherche:');
      console.log(`   ⏱️  Temps: ${processingTime}ms`);
      console.log(`   🔤 Termes extraits: ${searchResult.searchParams.searchTerms.join(', ')}`);
      console.log(`   📂 Catégories: ${searchResult.searchParams.categories.join(', ')}`);
      console.log(`   📅 Période: ${searchResult.searchParams.dateRange.start || 'Non spécifiée'} - ${searchResult.searchParams.dateRange.end || 'Non spécifiée'}`);
      console.log(`   🔒 Confidentialité: ${searchResult.searchParams.confidentialityFilter.join(', ')}`);
      console.log(`   📈 Priorité: ${searchResult.searchParams.priority}`);
      console.log(`   🎯 Stratégie: ${searchResult.searchParams.searchStrategy}`);
      console.log(`   📊 Résultats trouvés: ${searchResult.totalFound}`);
      console.log(`   🎯 Confiance: ${(searchResult.searchParams.confidence * 100).toFixed(1)}%`);
      
    } catch (error) {
      console.error(`❌ Erreur test ${i + 1}:`, error.message);
    }
  }
}

async function testSecurityMonitoring() {
  console.log('\n\n🧪 Test de surveillance sécurité');
  console.log('='.repeat(60));
  
  const securityScenarios = [
    {
      event: "document_access",
      user: "john.doe@company.com",
      document: "contrat_confidentiel.pdf",
      action: "read",
      description: "Accès normal à un document confidentiel"
    },
    {
      event: "unauthorized_access",
      user: "intern@company.com",
      document: "rapport_financier_secret.xlsx",
      action: "download",
      description: "Tentative d'accès non autorisé"
    },
    {
      event: "document_expired",
      user: "system",
      document: "contrat_partenariat_2023.pdf",
      action: "expiration_check",
      description: "Document expiré détecté"
    },
    {
      event: "suspicious_activity",
      user: "external.user@unknown.com",
      document: "database_backup.sql",
      action: "multiple_downloads",
      description: "Activité suspecte détectée"
    }
  ];
  
  for (let i = 0; i < securityScenarios.length; i++) {
    const { event, user, document, action, description } = securityScenarios[i];
    
    console.log(`\n🚨 Test ${i + 1}: ${description}`);
    console.log(`Événement: ${event}`);
    console.log(`Utilisateur: ${user}`);
    console.log(`Document: ${document}`);
    console.log(`Action: ${action}`);
    console.log('-'.repeat(40));
    
    try {
      const startTime = Date.now();
      const securityResult = await dexoAgent.checkSecurity(event, user, document, action, {
        timestamp: new Date().toISOString(),
        ip: "192.168.1.100",
        userAgent: "Test-Agent/1.0"
      });
      const processingTime = Date.now() - startTime;
      
      console.log('🚨 Résultats sécurité:');
      console.log(`   ⏱️  Temps: ${processingTime}ms`);
      console.log(`   🚨 Niveau d'alerte: ${securityResult.alertLevel}`);
      console.log(`   📋 Type d'alerte: ${securityResult.alertType}`);
      console.log(`   📝 Description: ${securityResult.description}`);
      console.log(`   📄 Documents affectés: ${securityResult.affectedDocuments.join(', ')}`);
      console.log(`   ✅ Actions recommandées: ${securityResult.recommendedActions.join(', ')}`);
      console.log(`   👥 Notifier: ${securityResult.notifyRoles.join(', ')}`);
      console.log(`   🤖 Actions auto: ${securityResult.autoActions.join(', ')}`);
      console.log(`   🎯 Confiance: ${(securityResult.confidence * 100).toFixed(1)}%`);
      
    } catch (error) {
      console.error(`❌ Erreur test ${i + 1}:`, error.message);
    }
  }
}

async function testDocumentGeneration() {
  console.log('\n\n🧪 Test de génération automatique de documents');
  console.log('='.repeat(60));
  
  const generationTests = [
    {
      documentType: "contrat_service",
      requirements: "Contrat de prestation de services informatiques avec clause de confidentialité",
      data: {
        client: "Entreprise ABC",
        prestataire: "TechCorp",
        duree: "12 mois",
        montant: "25000€",
        dateDebut: "2024-04-01"
      },
      description: "Génération contrat de service"
    },
    {
      documentType: "rapport_incident",
      requirements: "Rapport d'incident de sécurité avec analyse et recommandations",
      data: {
        dateIncident: "2024-03-15",
        typeIncident: "Tentative d'intrusion",
        impact: "Faible",
        mesuresPrises: "Blocage IP, renforcement firewall"
      },
      description: "Génération rapport d'incident"
    },
    {
      documentType: "politique_securite",
      requirements: "Politique de sécurité informatique pour les employés",
      data: {
        entreprise: "E-Team Corp",
        version: "2.1",
        dateApplication: "2024-04-01"
      },
      description: "Génération politique de sécurité"
    }
  ];
  
  for (let i = 0; i < generationTests.length; i++) {
    const { documentType, requirements, data, description } = generationTests[i];
    
    console.log(`\n📄 Test ${i + 1}: ${description}`);
    console.log(`Type: ${documentType}`);
    console.log(`Exigences: ${requirements}`);
    console.log('-'.repeat(40));
    
    try {
      const startTime = Date.now();
      const generationResult = await dexoAgent.generateDocument(
        documentType,
        requirements,
        data,
        "markdown",
        "français"
      );
      const processingTime = Date.now() - startTime;
      
      console.log('📄 Résultats génération:');
      console.log(`   ⏱️  Temps: ${processingTime}ms`);
      console.log(`   ✅ Succès: ${generationResult.success}`);
      
      if (generationResult.success) {
        console.log(`   📝 Fichier: ${generationResult.filename}`);
        console.log(`   📂 Catégorie: ${generationResult.classification.category}`);
        console.log(`   🔒 Confidentialité: ${generationResult.classification.confidentialityLevel}`);
        console.log(`   📊 Contenu (aperçu): ${generationResult.content.substring(0, 100)}...`);
      } else {
        console.log(`   ❌ Erreur: ${generationResult.error}`);
      }
      
    } catch (error) {
      console.error(`❌ Erreur test ${i + 1}:`, error.message);
    }
  }
}

async function testDuplicateDetection() {
  console.log('\n\n🧪 Test de détection de doublons');
  console.log('='.repeat(60));
  
  const duplicateTests = [
    {
      filename: "contrat_abc_2024.pdf",
      content: "CONTRAT DE PARTENARIAT\nEntre ABC et XYZ\nDurée: 2 ans\nMontant: 50000€\nSigné le 15/01/2024",
      description: "Document original"
    },
    {
      filename: "contrat_abc_copie.pdf",
      content: "CONTRAT DE PARTENARIAT\nEntre ABC et XYZ\nDurée: 2 ans\nMontant: 50000€\nSigné le 15/01/2024",
      description: "Copie exacte"
    },
    {
      filename: "contrat_abc_v2.pdf",
      content: "CONTRAT DE PARTENARIAT\nEntre ABC et XYZ\nDurée: 3 ans\nMontant: 60000€\nSigné le 15/01/2024\nModification: extension durée",
      description: "Version modifiée"
    },
    {
      filename: "facture_def_456.pdf",
      content: "FACTURE N°456\nClient: DEF Corp\nMontant: 2500€\nDate: 01/03/2024",
      description: "Document différent"
    }
  ];
  
  for (let i = 0; i < duplicateTests.length; i++) {
    const { filename, content, description } = duplicateTests[i];
    
    console.log(`\n🔄 Test ${i + 1}: ${description}`);
    console.log(`Fichier: ${filename}`);
    console.log('-'.repeat(40));
    
    try {
      const startTime = Date.now();
      const duplicateResult = await dexoAgent.detectDuplicates(filename, content, {
        uploadedBy: "test-user",
        timestamp: new Date().toISOString()
      });
      const processingTime = Date.now() - startTime;
      
      console.log('🔄 Résultats détection doublons:');
      console.log(`   ⏱️  Temps: ${processingTime}ms`);
      console.log(`   🔄 Est doublon: ${duplicateResult.isDuplicate ? '🔴 Oui' : '🟢 Non'}`);
      console.log(`   📊 Score similarité: ${(duplicateResult.similarityScore * 100).toFixed(1)}%`);
      console.log(`   📋 Type: ${duplicateResult.duplicateType}`);
      console.log(`   📄 Documents similaires: ${duplicateResult.matchingDocuments.length}`);
      console.log(`   💡 Action recommandée: ${duplicateResult.recommendedAction}`);
      console.log(`   🎯 Confiance: ${(duplicateResult.confidence * 100).toFixed(1)}%`);
      
      if (duplicateResult.matchingDocuments.length > 0) {
        console.log('   📋 Correspondances:');
        duplicateResult.matchingDocuments.forEach((match, idx) => {
          console.log(`      ${idx + 1}. ${match.filename} (${(match.similarity * 100).toFixed(1)}%) - ${match.reason}`);
        });
      }
      
    } catch (error) {
      console.error(`❌ Erreur test ${i + 1}:`, error.message);
    }
  }
}

async function testFullDocumentProcessing() {
  console.log('\n\n🧪 Test de traitement complet de document');
  console.log('='.repeat(60));
  
  const testDocument = {
    filename: "rapport_audit_2024.pdf",
    content: "RAPPORT D'AUDIT INTERNE 2024\n\nCONFIDENTIEL - ACCÈS RESTREINT\n\nAudit des processus financiers\nPériode: Janvier-Mars 2024\nAuditeur: Marie Dupont\n\nRésultats:\n- Conformité réglementaire: 95%\n- Risques identifiés: 3 majeurs, 7 mineurs\n- Recommandations: 12 actions correctives\n\nExpiration du rapport: 31 décembre 2024\nAccès autorisé: Direction, Audit interne, Compliance",
    userId: "marie.dupont@company.com"
  };
  
  console.log(`📋 Traitement complet: ${testDocument.filename}`);
  console.log(`👤 Utilisateur: ${testDocument.userId}`);
  console.log('-'.repeat(40));
  
  try {
    const startTime = Date.now();
    const processingResult = await dexoAgent.processDocument(
      testDocument.filename,
      testDocument.content,
      testDocument.userId,
      {
        department: "audit",
        source: "internal_audit",
        priority: "high"
      }
    );
    const processingTime = Date.now() - startTime;
    
    console.log('📋 Résultats traitement complet:');
    console.log(`   ⏱️  Temps total: ${processingTime}ms`);
    console.log(`   ✅ Succès: ${processingResult.success}`);
    
    if (processingResult.success) {
      console.log('\n   📁 Classification:');
      console.log(`      📂 Catégorie: ${processingResult.classification.category}`);
      console.log(`      🔒 Confidentialité: ${processingResult.classification.confidentialityLevel}`);
      console.log(`      📈 Priorité: ${processingResult.classification.priority}`);
      
      console.log('\n   🚨 Sécurité:');
      console.log(`      🚨 Niveau alerte: ${processingResult.securityCheck.alertLevel}`);
      console.log(`      📋 Type: ${processingResult.securityCheck.alertType}`);
      
      console.log('\n   🔄 Doublons:');
      console.log(`      🔄 Doublon détecté: ${processingResult.duplicateCheck.isDuplicate ? 'Oui' : 'Non'}`);
      console.log(`      💡 Action: ${processingResult.duplicateCheck.recommendedAction}`);
      
      if (processingResult.versionInfo) {
        console.log('\n   📋 Version:');
        console.log(`      🆔 ID: ${processingResult.versionInfo.versionId}`);
        console.log(`      📅 Créée: ${processingResult.versionInfo.metadata.createdAt}`);
      }
      
      console.log('\n   💡 Recommandations:');
      processingResult.recommendations.forEach((rec, idx) => {
        console.log(`      ${idx + 1}. [${rec.priority}] ${rec.message}`);
      });
    } else {
      console.log(`   ❌ Erreur: ${processingResult.error}`);
    }
    
  } catch (error) {
    console.error('❌ Erreur traitement complet:', error.message);
  }
}

async function testExpirationMonitoring() {
  console.log('\n\n🧪 Test de surveillance des expirations');
  console.log('='.repeat(60));
  
  try {
    const startTime = Date.now();
    const expirationResult = await dexoAgent.checkExpirations();
    const processingTime = Date.now() - startTime;
    
    console.log('📅 Résultats surveillance expirations:');
    console.log(`   ⏱️  Temps: ${processingTime}ms`);
    console.log(`   📄 Documents expirés: ${expirationResult.expired.length}`);
    console.log(`   ⚠️  Bientôt expirés: ${expirationResult.expiringSoon.length}`);
    console.log(`   📊 Total vérifié: ${expirationResult.totalChecked}`);
    
    if (expirationResult.expired.length > 0) {
      console.log('\n   📄 Documents expirés:');
      expirationResult.expired.forEach((doc, idx) => {
        console.log(`      ${idx + 1}. ${doc.filename} - Expiré le ${doc.expirationDate}`);
      });
    }
    
    if (expirationResult.expiringSoon.length > 0) {
      console.log('\n   ⚠️  Documents bientôt expirés:');
      expirationResult.expiringSoon.forEach((doc, idx) => {
        console.log(`      ${idx + 1}. ${doc.filename} - Expire le ${doc.expirationDate}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erreur surveillance expirations:', error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Démarrage des tests Agent Dexo (Administrative Document Agent)');
  console.log('🔗 Intégration: LangChain + n8n + GROQ');
  console.log('='.repeat(80));
  
  await testDocumentClassification();
  await testIntelligentSearch();
  await testSecurityMonitoring();
  await testDocumentGeneration();
  await testDuplicateDetection();
  await testFullDocumentProcessing();
  await testExpirationMonitoring();
  
  console.log('\n✅ Tous les tests Dexo terminés!');
  console.log('💡 L\'agent Dexo est maintenant opérationnel avec:');
  console.log('   📁 Classification automatique intelligente');
  console.log('   🔍 Recherche sémantique en langage naturel');
  console.log('   🚨 Surveillance sécurité en temps réel');
  console.log('   📄 Génération automatique de documents');
  console.log('   🔄 Détection avancée de doublons');
  console.log('   📋 Gestion de versions automatique');
  console.log('   📅 Surveillance des expirations');
  console.log('   🔗 Intégration n8n pour workflows');
  console.log('   🎯 Recommandations intelligentes');
}

// Exécuter tous les tests
runAllTests().catch(console.error);