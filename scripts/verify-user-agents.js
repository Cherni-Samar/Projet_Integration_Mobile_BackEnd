/**
 * Script pour vérifier les agents d'un utilisateur
 * Usage: node scripts/verify-user-agents.js [email]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function verifyUserAgents(userEmail) {
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

    console.log('\n📋 Informations de l\'utilisateur:');
    console.log('='.repeat(50));
    console.log(`📧 Email: ${user.email}`);
    console.log(`👤 Nom: ${user.name || 'Non défini'}`);
    console.log(`🏢 Type d'entreprise: ${user.businessType || 'Non défini'}`);
    console.log(`📊 Plan: ${user.subscriptionPlan}`);
    console.log(`📈 Limite d'agents: ${user.maxAgentsAllowed}`);
    console.log(`💰 Crédits: ${user.credits}`);
    console.log(`⚡ Énergie: ${user.energyBalance}`);
    console.log(`🤖 Agents actifs (${user.activeAgents.length}): ${user.activeAgents.join(', ') || 'Aucun'}`);
    console.log(`✅ Email vérifié: ${user.isEmailVerified}`);
    console.log(`📅 Créé le: ${user.createdAt?.toLocaleDateString('fr-FR')}`);
    console.log(`📅 Dernière mise à jour: ${user.updatedAt?.toLocaleDateString('fr-FR')}`);

    // Vérifier si tous les agents principaux sont présents
    const expectedAgents = ['echo', 'hera', 'dexo'];
    const missingAgents = expectedAgents.filter(agent => !user.activeAgents.includes(agent));
    
    if (missingAgents.length === 0) {
      console.log('\n✅ Tous les agents principaux sont configurés!');
      console.log('🎉 L\'utilisateur peut voir Echo, Hera et Dexo dans "My Agents"');
    } else {
      console.log(`\n⚠️  Agents manquants: ${missingAgents.join(', ')}`);
      console.log('💡 Utilisez le script setup-user-agents.js pour les ajouter');
    }

    // Vérifier les ressources
    if (user.energyBalance > 0) {
      console.log(`\n⚡ L'utilisateur a ${user.energyBalance} points d'énergie pour utiliser les agents`);
    } else {
      console.log('\n⚠️  L\'utilisateur n\'a pas d\'énergie pour utiliser les agents');
    }

    if (user.credits > 0) {
      console.log(`💰 L'utilisateur a ${user.credits} crédits disponibles`);
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Connexion fermée');
  }
}

// Récupérer l'email depuis les arguments de ligne de commande
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Usage: node scripts/verify-user-agents.js <email>');
  console.error('❌ Exemple: node scripts/verify-user-agents.js test@eteam.com');
  process.exit(1);
}

// Exécuter le script
verifyUserAgents(userEmail);