/**
 * Script pour tester les endpoints API des agents
 * Usage: node scripts/test-api-endpoints.js
 * Note: Le serveur doit être démarré (npm start) avant d'exécuter ce script
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_USER = {
  email: 'test@eteam.com',
  password: 'password123'
};

let authToken = null;

async function login() {
  try {
    console.log('🔐 Connexion de l\'utilisateur de test...');
    const response = await axios.post(`${BASE_URL}/auth/login`, TEST_USER);
    
    if (response.data.success && response.data.token) {
      authToken = response.data.token;
      console.log('✅ Connexion réussie');
      console.log(`👤 Utilisateur: ${response.data.data.user.email}`);
      console.log(`🤖 Agents actifs: ${response.data.data.user.activeAgents.join(', ')}`);
      return true;
    } else {
      console.error('❌ Échec de la connexion');
      return false;
    }
  } catch (error) {
    console.error('❌ Erreur de connexion:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testEchoAgentDirect() {
  try {
    console.log('\n🧪 Test Echo Agent (endpoint direct)...');
    const response = await axios.post(`${BASE_URL}/echo/analyser`, {
      message: "Urgent: Le serveur de production est en panne depuis 15 minutes!"
    });
    
    console.log('✅ Echo Agent (direct) fonctionne');
    console.log(`📊 Résumé: ${response.data.summary}`);
    console.log(`🔴 Urgent: ${response.data.isUrgent}`);
    console.log(`📈 Priorité: ${response.data.priority}`);
    console.log(`📂 Catégorie: ${response.data.category}`);
    
  } catch (error) {
    console.error('❌ Erreur Echo Agent (direct):', error.response?.data?.message || error.message);
  }
}

async function testEchoAgentAuth() {
  try {
    console.log('\n🧪 Test Echo Agent (avec authentification)...');
    const response = await axios.post(`${BASE_URL}/agents/echo`, {
      message: "Réunion d'équipe prévue demain à 10h",
      sender: "manager@company.com"
    }, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    console.log('✅ Echo Agent (auth) fonctionne');
    console.log(`📊 Analyse: ${JSON.stringify(response.data.analysis, null, 2)}`);
    
  } catch (error) {
    console.error('❌ Erreur Echo Agent (auth):', error.response?.data?.message || error.message);
  }
}

async function testEchoAgentStatus() {
  try {
    console.log('\n🧪 Test statut Echo Agent...');
    const response = await axios.get(`${BASE_URL}/agents/echo`);
    
    console.log('✅ Statut Echo Agent récupéré');
    console.log(`📊 Statut: ${response.data.status}`);
    console.log(`🛠️ Capacités: ${response.data.capabilities.join(', ')}`);
    
  } catch (error) {
    console.error('❌ Erreur statut Echo Agent:', error.response?.data?.message || error.message);
  }
}

async function testEchoBatch() {
  try {
    console.log('\n🧪 Test Echo Agent (batch)...');
    const response = await axios.post(`${BASE_URL}/echo/batch`, {
      messages: [
        "Urgent: Serveur en panne",
        "Réunion demain à 14h",
        "Félicitations pour votre travail"
      ]
    });
    
    console.log('✅ Echo Agent (batch) fonctionne');
    console.log(`📊 Messages traités: ${response.data.total}`);
    response.data.resultats.forEach((result, index) => {
      console.log(`   ${index + 1}. ${result.summary} (${result.priority})`);
    });
    
  } catch (error) {
    console.error('❌ Erreur Echo Agent (batch):', error.response?.data?.message || error.message);
  }
}

async function testHealthCheck() {
  try {
    console.log('\n🧪 Test santé du serveur...');
    const response = await axios.get(`${BASE_URL.replace('/api', '')}/health`);
    
    console.log('✅ Serveur en bonne santé');
    console.log(`📊 MongoDB: ${response.data.mongodb.status}`);
    console.log(`🛠️ Spam Filter: ${response.data.config.spamFilter ? 'Activé' : 'Désactivé'}`);
    
  } catch (error) {
    console.error('❌ Erreur santé serveur:', error.response?.data?.message || error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Démarrage des tests API');
  console.log('='.repeat(60));
  console.log('💡 Assurez-vous que le serveur fonctionne (npm start)');
  console.log('');
  
  // Test de santé du serveur
  await testHealthCheck();
  
  // Test de connexion
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('❌ Impossible de continuer sans authentification');
    return;
  }
  
  // Tests des agents
  await testEchoAgentStatus();
  await testEchoAgentDirect();
  await testEchoAgentAuth();
  await testEchoBatch();
  
  console.log('\n✅ Tous les tests terminés!');
  console.log('💡 Si vous voyez des erreurs de connexion, vérifiez que:');
  console.log('   1. Le serveur Node.js fonctionne (npm start)');
  console.log('   2. MongoDB est connecté');
  console.log('   3. Le port 3000 est disponible');
}

// Exécuter tous les tests
runAllTests().catch(console.error);