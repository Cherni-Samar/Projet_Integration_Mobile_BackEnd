/**
 * Script pour ajouter l'agent Dexo aux utilisateurs existants
 * Usage: node scripts/add-dexo-to-users.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function addDexoToUsers() {
  try {
    console.log('🔌 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB\n');

    // Trouver tous les utilisateurs
    const users = await User.find({});
    
    if (users.length === 0) {
      console.log('❌ Aucun utilisateur trouvé dans la base de données');
      return;
    }

    console.log(`👥 ${users.length} utilisateur(s) trouvé(s)`);
    console.log('🤖 Ajout de l\'agent Dexo...\n');

    let updatedCount = 0;
    let alreadyHadDexo = 0;

    for (const user of users) {
      const activeAgents = Array.isArray(user.activeAgents) ? user.activeAgents : [];
      
      if (!activeAgents.includes('dexo')) {
        // Ajouter Dexo aux agents actifs
        user.activeAgents = [...activeAgents, 'dexo'];
        
        // Mettre à jour le plan si nécessaire pour permettre plus d'agents
        if (user.maxAgentsAllowed < 3) {
          user.maxAgentsAllowed = 3;
          user.subscriptionPlan = 'basic'; // Au minimum basic pour 3 agents
        }
        
        // Ajouter des crédits pour tester Dexo
        user.credits = Math.max(user.credits || 0, 100);
        
        await user.save();
        updatedCount++;
        
        console.log(`✅ ${user.email}:`);
        console.log(`   🤖 Agents: ${user.activeAgents.join(', ')}`);
        console.log(`   📊 Plan: ${user.subscriptionPlan} (${user.maxAgentsAllowed} agents max)`);
        console.log(`   💰 Crédits: ${user.credits}`);
        console.log('');
      } else {
        alreadyHadDexo++;
        console.log(`ℹ️  ${user.email} avait déjà l'agent Dexo`);
      }
    }

    console.log('\n📊 Résumé:');
    console.log('='.repeat(50));
    console.log(`👥 Total utilisateurs: ${users.length}`);
    console.log(`✅ Mis à jour avec Dexo: ${updatedCount}`);
    console.log(`ℹ️  Avaient déjà Dexo: ${alreadyHadDexo}`);
    
    if (updatedCount > 0) {
      console.log('\n🎉 Agent Dexo ajouté avec succès!');
      console.log('\n🧪 Fonctionnalités Dexo disponibles:');
      console.log('   📁 Classification automatique des documents');
      console.log('   🔍 Recherche intelligente en langage naturel');
      console.log('   🚨 Surveillance sécurité et alertes');
      console.log('   🔄 Détection de doublons avancée');
      console.log('   📋 Gestion de versions automatique');
      console.log('   📅 Suivi des dates d\'expiration');
      console.log('   📄 Génération automatique de documents');
      console.log('   🔗 Intégration n8n pour workflows');
      
      console.log('\n📡 Endpoints disponibles:');
      console.log('   GET  /api/agents/dexo - Statut de l\'agent');
      console.log('   POST /api/agents/dexo - Traitement via agent');
      console.log('   POST /api/dexo/upload - Upload et traitement');
      console.log('   POST /api/dexo/classify - Classification');
      console.log('   POST /api/dexo/search - Recherche intelligente');
      console.log('   POST /api/dexo/security-check - Vérification sécurité');
      console.log('   POST /api/dexo/generate-document - Génération');
      console.log('   GET  /api/dexo/health - Health check');
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Connexion fermée');
  }
}

// Fonction pour créer un utilisateur de test avec Dexo
async function createTestUserWithDexo() {
  try {
    console.log('👤 Création d\'un utilisateur de test avec Dexo...');
    
    const testUser = new User({
      email: 'test.dexo@example.com',
      password: '$2a$10$example.hash.for.testing', // Hash fictif
      name: 'Test User Dexo',
      businessType: 'Tech',
      credits: 500,
      activeAgents: ['echo', 'hera', 'dexo'],
      subscriptionPlan: 'premium',
      maxAgentsAllowed: 5,
      energyBalance: 500,
      isEmailVerified: true,
      subscriptionStatus: 'active'
    });

    await testUser.save();
    
    console.log('✅ Utilisateur de test créé:');
    console.log(`   📧 Email: ${testUser.email}`);
    console.log(`   🤖 Agents: ${testUser.activeAgents.join(', ')}`);
    console.log(`   📊 Plan: ${testUser.subscriptionPlan}`);
    console.log(`   💰 Crédits: ${testUser.credits}`);
    
  } catch (error) {
    if (error.code === 11000) {
      console.log('ℹ️  Utilisateur de test existe déjà');
    } else {
      console.error('❌ Erreur création utilisateur test:', error.message);
    }
  }
}

// Menu interactif
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--create-test')) {
    await createTestUserWithDexo();
  } else {
    await addDexoToUsers();
  }
}

// Exécuter le script
main().catch(console.error);