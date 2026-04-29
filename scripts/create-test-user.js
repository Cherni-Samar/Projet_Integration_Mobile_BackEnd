/**
 * Script pour créer un utilisateur de test avec les agents Echo et Hera
 * Usage: node scripts/create-test-user.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function createTestUser() {
  try {
    console.log('🔌 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB');

    // Données de l'utilisateur de test
    const testUserData = {
      email: 'test@eteam.com',
      password: 'password123',
      name: 'Test User',
      businessType: 'Tech',
      credits: 500,
      energyBalance: 500,
      activeAgents: ['echo', 'hera'],
      subscriptionPlan: 'premium',
      maxAgentsAllowed: 5,
      subscriptionStatus: 'active',
      isEmailVerified: true,
      tasksCompletedCount: 0
    };

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email: testUserData.email });
    if (existingUser) {
      console.log('👤 Utilisateur de test existe déjà, mise à jour...');
      
      // Mettre à jour l'utilisateur existant
      existingUser.activeAgents = ['echo', 'hera'];
      existingUser.subscriptionPlan = 'premium';
      existingUser.maxAgentsAllowed = 5;
      existingUser.credits = Math.max(existingUser.credits, 500);
      existingUser.energyBalance = Math.max(existingUser.energyBalance || 0, 500);
      existingUser.isEmailVerified = true;
      
      await existingUser.save();
      
      console.log('✅ Utilisateur mis à jour avec succès!');
      displayUserInfo(existingUser);
      return;
    }

    // Hasher le mot de passe
    const saltRounds = 10;
    testUserData.password = await bcrypt.hash(testUserData.password, saltRounds);

    // Créer l'utilisateur
    const newUser = new User(testUserData);
    await newUser.save();

    console.log('✅ Utilisateur de test créé avec succès!');
    displayUserInfo(newUser);

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    if (error.code === 11000) {
      console.error('💡 L\'utilisateur existe déjà. Utilisez un email différent.');
    }
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Connexion fermée');
  }
}

function displayUserInfo(user) {
  console.log('\n📋 Informations de l\'utilisateur de test:');
  console.log('='.repeat(50));
  console.log(`📧 Email: ${user.email}`);
  console.log(`👤 Nom: ${user.name}`);
  console.log(`🤖 Agents actifs: ${user.activeAgents.join(', ')}`);
  console.log(`💰 Crédits: ${user.credits}`);
  console.log(`⚡ Énergie: ${user.energyBalance}`);
  console.log(`📊 Plan: ${user.subscriptionPlan}`);
  console.log(`📈 Limite d'agents: ${user.maxAgentsAllowed}`);
  console.log(`✅ Email vérifié: ${user.isEmailVerified}`);
  
  console.log('\n🧪 Pour tester les agents:');
  console.log('1. Démarrez votre serveur: npm start');
  console.log('2. Connectez-vous avec:');
  console.log('   POST /api/auth/login');
  console.log('   { "email": "test@eteam.com", "password": "password123" }');
  console.log('3. Utilisez le token JWT pour tester:');
  console.log('   POST /api/agents/echo');
  console.log('   POST /api/echo/analyser');
}

// Exécuter le script
createTestUser();