/**
 * Script de test pour vérifier le fonctionnement des agents Echo, Hera et Dexo
 * Usage: node scripts/test-agents.js
 */

require('dotenv').config();
const echoAgent = require('../agents/Echoagent');
const dexoAgent = require('../agents/DexoAgent');
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testEchoAgent() {
  console.log('🧪 Test de l\'agent Echo...');
  console.log('='.repeat(40));

  const testMessages = [
    {
      message: "Urgent: Le serveur principal est en panne depuis 10 minutes!",
      sender: "admin@company.com"
    },
    {
      message: "Réunion prévue demain à 14h en salle de conférence",
      sender: "manager@company.com"
    },
    {
      message: "Félicitations pour votre excellent travail ce mois-ci",
      sender: "hr@company.com"
    }
  ];

  for (let i = 0; i < testMessages.length; i++) {
    const { message, sender } = testMessages[i];
    
    console.log(`\n📨 Test ${i + 1}:`);
    console.log(`Message: "${message}"`);
    console.log(`Expéditeur: ${sender}`);
    
    try {
      const result = await echoAgent.analyze(message, sender);
      
      console.log('📊 Résultat:');
      console.log(`   Résumé: ${result.summary}`);
      console.log(`   Urgent: ${result.isUrgent ? '🔴 Oui' : '🟢 Non'}`);
      console.log(`   Priorité: ${result.priority}`);
      console.log(`   Catégorie: ${result.category}`);
      console.log(`   Actions: ${result.actions.join(', ') || 'Aucune'}`);
      
      if (result.error) {
        console.log(`   ⚠️ Erreur: ${result.error}`);
      }
      
    } catch (error) {
      console.error(`❌ Erreur lors du test ${i + 1}:`, error.message);
    }
  }
}

async function testDexoAgent() {
  console.log('\n🧪 Test de l\'agent Dexo...');
  console.log('='.repeat(40));

  const testDocuments = [
    {
      filename: "contrat_partenariat_2024.pdf",
      content: "CONTRAT DE PARTENARIAT\n\nEntre la société ABC et XYZ, il est convenu que...\nDurée: 2 ans\nMontant: 50 000€\nSigné le 15 janvier 2024\nExpiration: 15 janvier 2026",
      description: "Contrat commercial avec date d'expiration"
    },
    {
      filename: "rapport_securite_confidentiel.docx",
      content: "RAPPORT DE SÉCURITÉ - CONFIDENTIEL\n\nAnalyse des vulnérabilités système\nAccès restreint - Personnel autorisé uniquement\nFailles critiques identifiées\nRecommandations urgentes",
      description: "Document technique confidentiel"
    }
  ];

  for (let i = 0; i < testDocuments.length; i++) {
    const { filename, content, description } = testDocuments[i];
    
    console.log(`\n📁 Test ${i + 1}: ${description}`);
    console.log(`Fichier: ${filename}`);
    
    try {
      const result = await dexoAgent.classifyDocument(filename, content, {
        uploadedBy: "test-user",
        source: "test-script"
      });
      
      console.log('📊 Classification:');
      console.log(`   📂 Catégorie: ${result.category} > ${result.subcategory}`);
      console.log(`   🔒 Confidentialité: ${result.confidentialityLevel}`);
      console.log(`   📝 Nom suggéré: ${result.suggestedName}`);
      console.log(`   🏷️  Tags: ${result.tags.join(', ')}`);
      console.log(`   📅 Expiration: ${result.expirationDate || 'Aucune'}`);
      console.log(`   📈 Priorité: ${result.priority}`);
      console.log(`   🎯 Confiance: ${(result.confidence * 100).toFixed(1)}%`);
      
      if (result.error) {
        console.log(`   ⚠️ Erreur: ${result.error}`);
      }
      
    } catch (error) {
      console.error(`❌ Erreur lors du test Dexo ${i + 1}:`, error.message);
    }
  }
}

async function testDexoSearch() {
  console.log('\n🔍 Test recherche intelligente Dexo...');
  console.log('='.repeat(40));

  const searchQueries = [
    "contrats signés le mois dernier",
    "documents confidentiels sur la sécurité",
    "factures importantes non payées"
  ];

  for (let i = 0; i < searchQueries.length; i++) {
    const query = searchQueries[i];
    
    console.log(`\n🔍 Recherche ${i + 1}: "${query}"`);
    
    try {
      const result = await dexoAgent.intelligentSearch(query, "manager", {
        department: "admin",
        timestamp: new Date().toISOString()
      });
      
      console.log('📊 Résultat recherche:');
      console.log(`   🔤 Termes: ${result.searchParams.searchTerms.join(', ')}`);
      console.log(`   📂 Catégories: ${result.searchParams.categories.join(', ')}`);
      console.log(`   🎯 Stratégie: ${result.searchParams.searchStrategy}`);
      console.log(`   📊 Résultats: ${result.totalFound}`);
      console.log(`   🎯 Confiance: ${(result.searchParams.confidence * 100).toFixed(1)}%`);
      
    } catch (error) {
      console.error(`❌ Erreur recherche ${i + 1}:`, error.message);
    }
  }
}

async function testHeraAgent() {
  console.log('\n🧪 Test de l\'agent Hera via API...');
  console.log('='.repeat(40));
  
  try {
    const response = await axios.post(`${BASE_URL}/hera/receive-email`, {
      subject: "Demande de congé",
      sender: "employee@company.com",
      content: "Bonjour, je souhaiterais prendre 3 jours de congé la semaine prochaine.",
      type: "leave_request"
    });
    
    console.log('✅ Hera Agent Response:');
    console.log(`   📧 Traité: ${response.data.success ? 'Oui' : 'Non'}`);
    console.log(`   📋 Action: ${response.data.action || 'Aucune'}`);
    console.log(`   💬 Message: ${response.data.message || 'N/A'}`);
    
  } catch (error) {
    console.error('❌ Erreur Hera Agent:', error.response?.data || error.message);
  }
}
async function testAgentConnectivity() {
  console.log('\n🔍 Test de connectivité des agents...');
  console.log('='.repeat(40));

  // Test des variables d'environnement
  console.log('📋 Variables d\'environnement:');
  console.log(`   GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '✅ Définie' : '❌ Manquante'}`);
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Définie' : '❌ Manquante'}`);
  console.log(`   MONGODB_URI: ${process.env.MONGODB_URI ? '✅ Définie' : '❌ Manquante'}`);
  console.log(`   N8N_URL: ${process.env.N8N_URL ? '✅ Définie' : '❌ Manquante'}`);

  // Test simple d'Echo
  try {
    console.log('\n🤖 Test basique Echo Agent...');
    const result = await echoAgent.analyze("Test de connectivité", "test@example.com");
    console.log('✅ Echo Agent fonctionne correctement');
    console.log(`   Résumé: ${result.summary}`);
  } catch (error) {
    console.error('❌ Echo Agent ne fonctionne pas:', error.message);
  }

  // Test simple de Dexo
  try {
    console.log('\n📁 Test basique Dexo Agent...');
    const result = await dexoAgent.classifyDocument("test.txt", "Document de test pour vérifier la connectivité", {});
    console.log('✅ Dexo Agent fonctionne correctement');
    console.log(`   Catégorie: ${result.category}`);
  } catch (error) {
    console.error('❌ Dexo Agent ne fonctionne pas:', error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Démarrage des tests des agents');
  console.log('='.repeat(60));
  
  await testAgentConnectivity();
  await testEchoAgent();
  await testHeraAgent();
  await testDexoAgent();
  await testDexoSearch();
  
  console.log('\n✅ Tests terminés!');
  console.log('💡 Agents disponibles:');
  console.log('   🔍 Echo - Analyse intelligente de messages');
  console.log('   👥 Hera - Gestion RH et emails');
  console.log('   📁 Dexo - Gestion intelligente de documents');
  console.log('\n💡 Si vous voyez des erreurs, vérifiez:');
  console.log('   1. Que GROQ_API_KEY est définie dans .env');
  console.log('   2. Que votre serveur Node.js fonctionne');
  console.log('   3. Que MongoDB est connecté');
  console.log('   4. Que n8n est configuré (optionnel)');
}

// Exécuter tous les tests
runAllTests().catch(console.error);