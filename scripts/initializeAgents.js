// =============================================================
//  SCRIPT - Initialize Agents with Energy Distribution
// =============================================================

require('dotenv').config();
const mongoose = require('mongoose');
const Agent = require('../models/Agent');

async function initializeAgents() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if agents already exist
    const existingAgents = await Agent.find();
    if (existingAgents.length > 0) {
      console.log(`⚠️  Agents already exist (${existingAgents.length} found)`);
      console.log('Current agents:');
      existingAgents.forEach(agent => {
        console.log(`  - ${agent.displayName}: ${agent.energy}/${agent.maxEnergy} energy`);
      });
      
      // Calculate total energy
      const totalEnergy = existingAgents.reduce((sum, agent) => sum + agent.energy, 0);
      console.log(`📊 Total energy: ${totalEnergy}`);
      
      process.exit(0);
    }

    console.log('🚀 Initializing agents with energy distribution...');

    // Create the 5 default agents with distributed energy (total = 850)
    const defaultAgents = [
      {
        name: 'dexo',
        displayName: 'Dexo',
        description: 'Document processing and analysis specialist',
        avatar: '/images/agents/dexo.png',
        energy: 170, // 20% of 850
        maxEnergy: 200,
        specialties: ['document-processing', 'data-analysis', 'classification'],
        status: 'active',
        readyStatus: 'ready'
      },
      {
        name: 'timo',
        displayName: 'Timo',
        description: 'Time management and scheduling expert',
        avatar: '/images/agents/timo.png',
        energy: 170, // 20% of 850
        maxEnergy: 200,
        specialties: ['scheduling', 'time-management', 'calendar'],
        status: 'active',
        readyStatus: 'ready'
      },
      {
        name: 'echo',
        displayName: 'Echo',
        description: 'Communication and social media automation',
        avatar: '/images/agents/echo.png',
        energy: 170, // 20% of 850
        maxEnergy: 200,
        specialties: ['communication', 'social-media', 'content-generation'],
        status: 'active',
        readyStatus: 'ready'
      },
      {
        name: 'hera',
        displayName: 'Hera',
        description: 'HR management and recruitment specialist',
        avatar: '/images/agents/hera.png',
        energy: 170, // 20% of 850
        maxEnergy: 200,
        specialties: ['hr-management', 'recruitment', 'employee-relations'],
        status: 'active',
        readyStatus: 'ready'
      },
      {
        name: 'kash',
        displayName: 'Kash',
        description: 'Financial analysis and payment processing',
        avatar: '/images/agents/kash.png',
        energy: 170, // 20% of 850
        maxEnergy: 200,
        specialties: ['financial-analysis', 'payments', 'accounting'],
        status: 'active',
        readyStatus: 'ready'
      }
    ];

    // Create all agents
    const createdAgents = await Agent.insertMany(defaultAgents);
    
    // Calculate total energy
    const totalEnergy = createdAgents.reduce((sum, agent) => sum + agent.energy, 0);
    
    console.log(`✅ Successfully created ${createdAgents.length} agents:`);
    createdAgents.forEach(agent => {
      console.log(`  - ${agent.displayName}: ${agent.energy}/${agent.maxEnergy} energy (${agent.getEnergyPercentage()}%)`);
    });
    
    console.log(`📊 Total energy distributed: ${totalEnergy}/850`);
    console.log('🎉 Agent initialization complete!');
    
  } catch (error) {
    console.error('❌ Error initializing agents:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the initialization
initializeAgents();