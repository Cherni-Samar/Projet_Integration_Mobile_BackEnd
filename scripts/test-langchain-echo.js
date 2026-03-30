/**
 * Script de test pour l'agent Echo amélioré avec LangChain
 * Usage: node scripts/test-langchain-echo.js
 */

require('dotenv').config();
const echoAgent = require('../agents/Echoagent');

async function testLangChainEcho() {
  console.log('🧪 Test de l\'agent Echo avec LangChain');
  console.log('='.repeat(60));

  const testMessages = [
    {
      message: "URGENT: Le serveur principal est en panne depuis 30 minutes! Les clients ne peuvent plus accéder au site. Besoin d'intervention immédiate!",
      sender: "admin@company.com",
      description: "Message critique nécessitant escalade"
    },
    {
      message: "Bonjour, pouvez-vous me dire quand aura lieu la prochaine réunion d'équipe? J'aimerais préparer mon rapport à l'avance. Merci!",
      sender: "employee@company.com", 
      description: "Question simple avec demande d'information"
    },
    {
      message: "Félicitations! Vous avez gagné 1000€! Cliquez ici pour récupérer votre prix maintenant! Offre limitée!",
      sender: "noreply@spam.com",
      description: "Spam évident à filtrer"
    },
    {
      message: "Il faut absolument organiser une réunion avec l'équipe marketing pour discuter du nouveau produit. Marie doit préparer la présentation pour vendredi. N'oubliez pas de réserver la salle de conférence.",
      sender: "manager@company.com",
      description: "Message avec plusieurs tâches à extraire"
    }
  ];

  for (let i = 0; i < testMessages.length; i++) {
    const { message, sender, description } = testMessages[i];
    
    console.log(`\n📨 Test ${i + 1}: ${description}`);
    console.log(`Message: "${message.substring(0, 80)}..."`);
    console.log(`Expéditeur: ${sender}`);
    console.log('-'.repeat(40));
    
    try {
      // Test de l'analyse complète avec LangChain
      const startTime = Date.now();
      const result = await echoAgent.fullAnalysis(message, sender, {
        conversationHistory: ["Message précédent dans la conversation"]
      });
      const processingTime = Date.now() - startTime;
      
      console.log('📊 Résultats de l\'analyse LangChain:');
      console.log(`   ⏱️  Temps de traitement: ${processingTime}ms`);
      console.log(`   📝 Résumé: ${result.summary}`);
      console.log(`   🚨 Urgent: ${result.isUrgent ? '🔴 Oui' : '🟢 Non'}`);
      console.log(`   📈 Priorité: ${result.priority}`);
      console.log(`   📂 Catégorie: ${result.category}`);
      console.log(`   🎯 Confiance: ${(result.confidence * 100).toFixed(1)}%`);
      
      if (result.actions && result.actions.length > 0) {
        console.log(`   ✅ Actions: ${result.actions.join(', ')}`);
      }
      
      if (result.autoReply) {
        console.log(`   🤖 Réponse auto: "${result.autoReply}"`);
      }
      
      if (result.escalation && result.escalation.shouldEscalate) {
        console.log(`   🚨 Escalade: ${result.escalation.escalationLevel} vers ${result.escalation.suggestedDepartment}`);
        console.log(`   📅 Délai: ${result.escalation.timeframe}`);
        console.log(`   💭 Raison: ${result.escalation.reason}`);
      }
      
      if (result.noiseFilter && result.noiseFilter.isNoise) {
        console.log(`   🔇 Bruit détecté: ${result.noiseFilter.noiseLevel} - Action: ${result.noiseFilter.action}`);
        console.log(`   💭 Raison: ${result.noiseFilter.reason}`);
      }
      
      if (result.taskExtraction && result.taskExtraction.tasks.length > 0) {
        console.log(`   📋 Tâches extraites (${result.taskExtraction.totalTasks}):`);
        result.taskExtraction.tasks.forEach((task, idx) => {
          console.log(`      ${idx + 1}. ${task.title} (${task.priority})`);
          console.log(`         📝 ${task.description}`);
          if (task.assignee) console.log(`         👤 Assigné à: ${task.assignee}`);
          if (task.deadline) console.log(`         📅 Échéance: ${task.deadline}`);
        });
      }
      
      if (result.recommendations && result.recommendations.length > 0) {
        console.log(`   💡 Recommandations:`);
        result.recommendations.forEach((rec, idx) => {
          console.log(`      ${idx + 1}. [${rec.priority}] ${rec.message}`);
        });
      }
      
      if (result.metadata) {
        console.log(`   🔧 Métadonnées LangChain:`);
        console.log(`      📦 Version: ${result.metadata.langchainVersion}`);
        console.log(`      🤖 Modèle: ${result.metadata.model}`);
        console.log(`      🏢 Provider: ${result.metadata.provider}`);
      }
      
    } catch (error) {
      console.error(`❌ Erreur lors du test ${i + 1}:`, error.message);
    }
  }
}

async function testBatchAnalysis() {
  console.log('\n\n🧪 Test de l\'analyse en lot avec LangChain');
  console.log('='.repeat(60));
  
  const batchMessages = [
    { message: "Réunion annulée", sender: "manager@company.com" },
    { message: "Urgent: Bug critique en production", sender: "dev@company.com" },
    { message: "Merci pour votre présentation", sender: "client@company.com" }
  ];
  
  try {
    const result = await echoAgent.batchAnalysis(batchMessages, {
      includeFullAnalysis: true,
      maxConcurrency: 2
    });
    
    console.log(`📦 Résultats du traitement en lot:`);
    console.log(`   📊 Total: ${result.total} messages`);
    console.log(`   ✅ Traités: ${result.processed}`);
    console.log(`   ❌ Échecs: ${result.failed}`);
    console.log(`   ⏱️  Métadonnées: ${JSON.stringify(result.metadata, null, 2)}`);
    
    if (result.results) {
      result.results.forEach((res, idx) => {
        if (res.success) {
          console.log(`   ${idx + 1}. ✅ "${res.message}" - Priorité: ${res.analysis.priority}`);
        } else {
          console.log(`   ${idx + 1}. ❌ "${res.message}" - Erreur: ${res.error}`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Erreur test batch:', error.message);
  }
}

async function testIndividualFeatures() {
  console.log('\n\n🧪 Test des fonctionnalités individuelles LangChain');
  console.log('='.repeat(60));
  
  const testMessage = "Il faut organiser une réunion urgente avec l'équipe technique pour résoudre le problème de sécurité. Marie doit préparer le rapport pour demain.";
  const sender = "security@company.com";
  
  try {
    // Test analyse de base
    console.log('\n🔍 Test analyse de base:');
    const basicAnalysis = await echoAgent.analyze(testMessage, sender);
    console.log(`   Résumé: ${basicAnalysis.summary}`);
    console.log(`   Priorité: ${basicAnalysis.priority}`);
    console.log(`   Confiance: ${(basicAnalysis.confidence * 100).toFixed(1)}%`);
    
    // Test réponse automatique
    console.log('\n🤖 Test réponse automatique:');
    const autoReply = await echoAgent.generateAutoReply(testMessage, {}, basicAnalysis);
    console.log(`   Réponse: "${autoReply}"`);
    
    // Test vérification escalade
    console.log('\n🚨 Test vérification escalade:');
    const escalation = await echoAgent.checkEscalation(testMessage, sender, basicAnalysis);
    console.log(`   Escalade nécessaire: ${escalation.shouldEscalate}`);
    console.log(`   Niveau: ${escalation.escalationLevel}`);
    console.log(`   Département: ${escalation.suggestedDepartment}`);
    
    // Test filtrage bruit
    console.log('\n🔇 Test filtrage bruit:');
    const noiseFilter = await echoAgent.filterNoise(testMessage, sender);
    console.log(`   Est du bruit: ${noiseFilter.isNoise}`);
    console.log(`   Action recommandée: ${noiseFilter.action}`);
    
    // Test extraction tâches
    console.log('\n📋 Test extraction tâches:');
    const taskExtraction = await echoAgent.extractTasks(testMessage, ["Contexte de conversation précédente"]);
    console.log(`   Nombre de tâches: ${taskExtraction.totalTasks}`);
    taskExtraction.tasks.forEach((task, idx) => {
      console.log(`   ${idx + 1}. ${task.title} - ${task.description}`);
    });
    
  } catch (error) {
    console.error('❌ Erreur test fonctionnalités:', error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Démarrage des tests LangChain Echo Agent');
  console.log('='.repeat(80));
  
  await testLangChainEcho();
  await testBatchAnalysis();
  await testIndividualFeatures();
  
  console.log('\n✅ Tous les tests LangChain terminés!');
  console.log('💡 L\'agent Echo est maintenant optimisé avec:');
  console.log('   - Chaînes LangChain structurées');
  console.log('   - Parseurs de sortie avec validation Zod');
  console.log('   - Traitement parallèle optimisé');
  console.log('   - Gestion d\'erreurs robuste');
  console.log('   - Métadonnées et recommandations automatiques');
}

// Exécuter tous les tests
runAllTests().catch(console.error);