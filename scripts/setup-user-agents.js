/**
 * Script pour configurer les agents (Echo, Hera, Dexo) pour un utilisateur
 * Usage: node scripts/setup-user-agents.js [email] [agents]
 * 
 * Exemples:
 * - node scripts/setup-user-agents.js user@example.com all
 * - node scripts/setup-user-agents.js user@example.com echo,hera
 * - node scripts/setup-user-agents.js user@example.com dexo
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function setupUserAgents(userEmail, agentsParam = 'all') {
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

    // Déterminer quels agents ajouter
    let agentsToAdd = [];
    if (agentsParam === 'all') {
      agentsToAdd = ['echo', 'hera', 'dexo'];
    } else {
      agentsToAdd = agentsParam.split(',').map(agent => agent.trim().toLowerCase());
    }

    // Valider les agents
    const validAgents = ['echo', 'hera', 'dexo'];
    const invalidAgents = agentsToAdd.filter(agent => !validAgents.includes(agent));
    if (invalidAgents.length > 0) {
      console.error(`❌ Agents invalides: ${invalidAgents.join(', ')}`);
      console.error(`✅ Agents valides: ${validAgents.join(', ')}`);
      process.exit(1);
    }

    console.log(`🎯 Agents à configurer: ${agentsToAdd.join(', ')}`);

    // Ajouter les agents s'ils ne sont pas déjà présents
    let agentsAdded = [];
    for (const agent of agentsToAdd) {
      if (!user.activeAgents.includes(agent)) {
        user.activeAgents.push(agent);
        agentsAdded.push(agent);
      }
    }

    // Mettre à jour le plan si nécessaire pour permettre plus d'agents
    if (user.activeAgents.length > user.maxAgentsAllowed) {
      const oldPlan = user.subscriptionPlan;
      user.subscriptionPlan = 'premium';
      user.maxAgentsAllowed = 5;
      console.log(`📈 Plan mis à jour de ${oldPlan} vers Premium pour permettre ${user.activeAgents.length} agents`);
    }

    // Calculer les crédits et l'énergie à ajouter basés sur le nombre d'agents ajoutés
    const creditsPerAgent = 50;
    const energyPerAgent = 50;
    const creditsToAdd = agentsAdded.length * creditsPerAgent;
    const energyToAdd = agentsAdded.length * energyPerAgent;

    user.credits += creditsToAdd;
    user.energyBalance += energyToAdd;

    // Sauvegarder les modifications
    await user.save();

    console.log('\n✅ Configuration réussie!');
    console.log(`🤖 Agents ajoutés: ${agentsAdded.join(', ') || 'Aucun nouveau'}`);
    console.log(`🤖 Agents actifs: ${user.activeAgents.join(', ')}`);
    console.log(`💰 Crédits ajoutés: +${creditsToAdd} (Total: ${user.credits})`);
    console.log(`⚡ Énergie ajoutée: +${energyToAdd} (Total: ${user.energyBalance})`);
    console.log(`📊 Plan: ${user.subscriptionPlan}`);
    console.log(`📈 Limite d'agents: ${user.maxAgentsAllowed}`);

    if (agentsAdded.length > 0) {
      console.log('\n🎉 Nouveaux agents disponibles dans "My Agents"!');
      console.log('💡 L\'utilisateur peut maintenant utiliser ces agents avec l\'énergie fournie.');
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Connexion fermée');
  }
}

// Récupérer les arguments de ligne de commande
const userEmail = process.argv[2];
const agentsParam = process.argv[3] || 'all';

if (!userEmail) {
  console.error('❌ Usage: node scripts/setup-user-agents.js <email> [agents]');
  console.error('');
  console.error('📋 Exemples:');
  console.error('   node scripts/setup-user-agents.js user@example.com all');
  console.error('   node scripts/setup-user-agents.js user@example.com echo,hera');
  console.error('   node scripts/setup-user-agents.js user@example.com dexo');
  console.error('');
  console.error('🤖 Agents disponibles: echo, hera, dexo');
  process.exit(1);
}

// Exécuter le script
setupUserAgents(userEmail, agentsParam);