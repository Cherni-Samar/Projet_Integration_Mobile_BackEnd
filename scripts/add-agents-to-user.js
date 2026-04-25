/**
 * Script pour ajouter les agents Echo, Hera et Dexo à un utilisateur pour les tests
 * Usage: node scripts/add-agents-to-user.js [email]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function addAgentsToUser(userEmail) {
  try {
    // Connexion à MongoDB
    console.log('🔌 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB');

    // Trouver l'utilisateur
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.error(`❌ Utilisateur avec l'email ${userEmail} non trouvé`);
      process.exit(1);
    }

    console.log(`👤 Utilisateur trouvé: ${user.name || user.email}`);
    console.log(`📊 Plan actuel: ${user.subscriptionPlan}`);
    console.log(`🤖 Agents actuels: ${user.activeAgents.join(', ') || 'Aucun'}`);
    console.log(`📈 Limite d'agents: ${user.maxAgentsAllowed}`);

    // Ajouter les agents Echo, Hera et Dexo s'ils ne sont pas déjà présents
    const agentsToAdd = ['echo', 'hera', 'dexo'];
    let agentsAdded = [];

    for (const agent of agentsToAdd) {
      if (!user.activeAgents.includes(agent)) {
        user.activeAgents.push(agent);
        agentsAdded.push(agent);
      }
    }

    // Mettre à jour le plan si nécessaire pour permettre plus d'agents
    if (user.activeAgents.length > user.maxAgentsAllowed) {
      user.subscriptionPlan = 'premium';
      user.maxAgentsAllowed = 5;
      console.log('📈 Plan mis à jour vers Premium pour permettre plus d\'agents');
    }

    // Ajouter des crédits et de l'énergie pour les tests
    user.credits += 150; // Plus de crédits pour 3 agents
    user.energyBalance += 150; // Plus d'énergie pour 3 agents

    // Sauvegarder les modifications
    await user.save();

    console.log('\n✅ Mise à jour réussie!');
    console.log(`🤖 Agents ajoutés: ${agentsAdded.join(', ') || 'Aucun nouveau'}`);
    console.log(`🤖 Agents actifs: ${user.activeAgents.join(', ')}`);
    console.log(`💰 Crédits: ${user.credits}`);
    console.log(`⚡ Énergie: ${user.energyBalance}`);
    console.log(`📊 Plan: ${user.subscriptionPlan}`);
    console.log(`📈 Limite d'agents: ${user.maxAgentsAllowed}`);

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Connexion fermée');
  }
}

// Récupérer l'email depuis les arguments de ligne de commande
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Usage: node scripts/add-agents-to-user.js <email>');
  console.error('❌ Exemple: node scripts/add-agents-to-user.js user@example.com');
  process.exit(1);
}

// Exécuter le script
addAgentsToUser(userEmail);