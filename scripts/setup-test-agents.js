/**
 * Script interactif pour configurer les agents Echo et Hera pour les tests
 * Usage: node scripts/setup-test-agents.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function listUsers() {
  try {
    console.log('🔌 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB\n');

    // Lister tous les utilisateurs
    const users = await User.find({}).select('email name subscriptionPlan activeAgents credits maxAgentsAllowed createdAt');
    
    if (users.length === 0) {
      console.log('❌ Aucun utilisateur trouvé dans la base de données');
      console.log('💡 Créez d\'abord un compte via l\'API /api/auth/register');
      return;
    }

    console.log('👥 Utilisateurs disponibles:');
    console.log('='.repeat(80));
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   📛 Nom: ${user.name || 'Non défini'}`);
      console.log(`   📊 Plan: ${user.subscriptionPlan} (${user.maxAgentsAllowed} agents max)`);
      console.log(`   🤖 Agents: ${user.activeAgents.length > 0 ? user.activeAgents.join(', ') : 'Aucun'}`);
      console.log(`   💰 Crédits: ${user.credits}`);
      console.log(`   📅 Créé: ${user.createdAt.toLocaleDateString()}`);
      console.log('');
    });

    // Configurer automatiquement le premier utilisateur pour les tests
    if (users.length > 0) {
      const firstUser = users[0];
      await setupUserForTesting(firstUser);
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Connexion fermée');
  }
}

async function setupUserForTesting(user) {
  try {
    console.log(`🔧 Configuration de ${user.email} pour les tests...`);
    
    // Ajouter les agents Echo, Hera et Dexo
    const agentsToAdd = ['echo', 'hera', 'dexo'];
    let agentsAdded = [];

    for (const agent of agentsToAdd) {
      if (!user.activeAgents.includes(agent)) {
        user.activeAgents.push(agent);
        agentsAdded.push(agent);
      }
    }

    // Mettre à jour le plan pour permettre plus d'agents
    user.subscriptionPlan = 'premium';
    user.maxAgentsAllowed = 5;
    
    // Ajouter des crédits pour les tests
    user.credits = Math.max(user.credits, 500);
    user.energyBalance = Math.max(user.energyBalance || 0, 500);

    // Marquer l'email comme vérifié
    user.isEmailVerified = true;

    await user.save();

    console.log('\n✅ Configuration terminée!');
    console.log('='.repeat(50));
    console.log(`👤 Utilisateur: ${user.email}`);
    console.log(`🤖 Agents disponibles: ${user.activeAgents.join(', ')}`);
    console.log(`💰 Crédits: ${user.credits}`);
    console.log(`⚡ Énergie: ${user.energyBalance}`);
    console.log(`📊 Plan: ${user.subscriptionPlan}`);
    console.log(`📈 Limite d'agents: ${user.maxAgentsAllowed}`);
    console.log(`✅ Email vérifié: ${user.isEmailVerified}`);
    
    console.log('\n🧪 Tests disponibles:');
    console.log('1. Echo Agent:');
    console.log('   POST /api/agents/echo');
    console.log('   POST /api/echo/analyser');
    console.log('');
    console.log('2. Hera Agent:');
    console.log('   POST /api/hera/receive-email');
    console.log('   GET /api/hera/actions');
    console.log('');
    console.log('3. Dexo Agent:');
    console.log('   POST /api/agents/dexo');
    console.log('   POST /api/dexo/classify');
    console.log('   POST /api/dexo/upload');
    console.log('   POST /api/dexo/search');
    console.log('');
    console.log('💡 Utilisez ces endpoints avec l\'email:', user.email);

  } catch (error) {
    console.error('❌ Erreur lors de la configuration:', error.message);
  }
}

// Exécuter le script
listUsers();