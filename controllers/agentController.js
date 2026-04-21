// =============================================================
//  CONTROLLER - Agent Management & Energy System
// =============================================================

const Agent = require('../models/Agent');
const User = require('../models/User');

// ─────────────────────────────────────────────
// GET ALL AGENTS WITH ENERGY STATUS
// GET /api/agents
// ─────────────────────────────────────────────
const getAllAgents = async (req, res) => {
  try {
    const agents = await Agent.find({ status: 'active' }).sort({ name: 1 });
    
    // Calculate total energy
    const totalEnergy = agents.reduce((sum, agent) => sum + agent.energy, 0);
    
    res.json({
      success: true,
      data: {
        agents: agents.map(agent => ({
          id: agent._id,
          name: agent.name,
          displayName: agent.displayName,
          description: agent.description,
          avatar: agent.avatar,
          energy: agent.energy,
          maxEnergy: agent.maxEnergy,
          energyPercentage: agent.getEnergyPercentage(),
          status: agent.status,
          readyStatus: agent.readyStatus,
          specialties: agent.specialties,
          isReady: agent.isReady(),
          stats: agent.stats,
          lastActivity: agent.lastActivity
        })),
        totalEnergy: totalEnergy,
        agentCount: agents.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getAllAgents:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

// ─────────────────────────────────────────────
// GET SINGLE AGENT
// GET /api/agents/:id
// ─────────────────────────────────────────────
const getAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await Agent.findById(id);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: agent._id,
        name: agent.name,
        displayName: agent.displayName,
        description: agent.description,
        avatar: agent.avatar,
        energy: agent.energy,
        maxEnergy: agent.maxEnergy,
        energyPercentage: agent.getEnergyPercentage(),
        status: agent.status,
        readyStatus: agent.readyStatus,
        specialties: agent.specialties,
        isReady: agent.isReady(),
        stats: agent.stats,
        lastActivity: agent.lastActivity,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getAgent:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

// ─────────────────────────────────────────────
// UPDATE AGENT ENERGY
// PUT /api/agents/:id/energy
// Body: { energy: 150 }
// ─────────────────────────────────────────────
const updateAgentEnergy = async (req, res) => {
  try {
    const { id } = req.params;
    const { energy } = req.body;
    
    if (typeof energy !== 'number' || energy < 0) {
      return res.status(400).json({
        success: false,
        error: 'Energy must be a positive number'
      });
    }
    
    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }
    
    // Check if energy exceeds max energy
    if (energy > agent.maxEnergy) {
      return res.status(400).json({
        success: false,
        error: `Energy cannot exceed maximum energy (${agent.maxEnergy})`
      });
    }
    
    const oldEnergy = agent.energy;
    agent.energy = energy;
    agent.lastActivity = new Date();
    await agent.save();
    
    console.log(`⚡ [AGENT] ${agent.name} energy updated: ${oldEnergy} → ${energy}`);
    
    res.json({
      success: true,
      message: `${agent.displayName} energy updated successfully`,
      data: {
        id: agent._id,
        name: agent.name,
        displayName: agent.displayName,
        energy: agent.energy,
        maxEnergy: agent.maxEnergy,
        energyPercentage: agent.getEnergyPercentage(),
        previousEnergy: oldEnergy,
        energyChange: energy - oldEnergy
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error updateAgentEnergy:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

// ─────────────────────────────────────────────
// DISTRIBUTE ENERGY AMONG ALL AGENTS
// POST /api/agents/distribute-energy
// Body: { distributions: [{ agentId: "id1", energy: 150 }, { agentId: "id2", energy: 200 }] }
// ─────────────────────────────────────────────
const distributeEnergy = async (req, res) => {
  try {
    const { distributions } = req.body;
    
    if (!Array.isArray(distributions) || distributions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Distributions array is required'
      });
    }
    
    // Validate distributions
    let totalEnergyToDistribute = 0;
    for (const dist of distributions) {
      if (!dist.agentId || typeof dist.energy !== 'number' || dist.energy < 0) {
        return res.status(400).json({
          success: false,
          error: 'Each distribution must have agentId and positive energy value'
        });
      }
      totalEnergyToDistribute += dist.energy;
    }
    
    // Get all agents to update
    const agentIds = distributions.map(d => d.agentId);
    const agents = await Agent.find({ _id: { $in: agentIds } });
    
    if (agents.length !== distributions.length) {
      return res.status(404).json({
        success: false,
        error: 'One or more agents not found'
      });
    }
    
    // Check max energy limits
    for (const dist of distributions) {
      const agent = agents.find(a => a._id.toString() === dist.agentId);
      if (dist.energy > agent.maxEnergy) {
        return res.status(400).json({
          success: false,
          error: `Energy for ${agent.displayName} cannot exceed maximum energy (${agent.maxEnergy})`
        });
      }
    }
    
    // Update all agents
    const updateResults = [];
    for (const dist of distributions) {
      const agent = agents.find(a => a._id.toString() === dist.agentId);
      const oldEnergy = agent.energy;
      agent.energy = dist.energy;
      agent.lastActivity = new Date();
      await agent.save();
      
      updateResults.push({
        id: agent._id,
        name: agent.name,
        displayName: agent.displayName,
        energy: agent.energy,
        maxEnergy: agent.maxEnergy,
        energyPercentage: agent.getEnergyPercentage(),
        previousEnergy: oldEnergy,
        energyChange: dist.energy - oldEnergy
      });
      
      console.log(`⚡ [AGENT] ${agent.name} energy updated: ${oldEnergy} → ${dist.energy}`);
    }
    
    res.json({
      success: true,
      message: `Energy distributed to ${distributions.length} agents`,
      data: {
        totalEnergyDistributed: totalEnergyToDistribute,
        agents: updateResults
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error distributeEnergy:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

// ─────────────────────────────────────────────
// BUY ENERGY FOR USER
// POST /api/agents/buy-energy
// Body: { amount: 100, paymentMethod: "stripe" }
// ─────────────────────────────────────────────
const buyEnergy = async (req, res) => {
  try {
    const { amount, paymentMethod = 'stripe' } = req.body;
    const userId = req.user?.id; // Get from auth middleware if available
    
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a positive number'
      });
    }
    
    if (amount > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Maximum energy purchase is 1000 per transaction'
      });
    }
    
    // Calculate price (example: 1 energy = $0.10)
    const pricePerEnergy = 0.10;
    const totalPrice = amount * pricePerEnergy;
    
    // Here you would integrate with payment processor (Stripe, PayPal, etc.)
    // For now, we'll simulate a successful payment
    const paymentResult = await simulatePayment(totalPrice, paymentMethod);
    
    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Payment failed',
        details: paymentResult.error
      });
    }
    
    // Find or create user energy record
    let user;
    if (userId) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      // For demo purposes, create a default user or use existing one
      user = await User.findOne({ email: 'demo@e-team.com' });
      if (!user) {
        user = new User({
          email: 'demo@e-team.com',
          password: 'demo123',
          name: 'Demo User',
          energyBalance: 0,
          totalEnergyPurchased: 0
        });
        await user.save();
      }
    }
    
    // Add energy to user balance
    user.energyBalance = (user.energyBalance || 0) + amount;
    user.totalEnergyPurchased = (user.totalEnergyPurchased || 0) + amount;
    user.lastEnergyPurchase = new Date();
    await user.save();
    
    console.log(`💰 [ENERGY] User ${userId} purchased ${amount} energy for $${totalPrice.toFixed(2)}`);
    
    res.json({
      success: true,
      message: `Successfully purchased ${amount} energy`,
      data: {
        energyPurchased: amount,
        totalPrice: totalPrice,
        paymentMethod: paymentMethod,
        transactionId: paymentResult.transactionId,
        userEnergyBalance: user.energyBalance,
        totalEnergyPurchased: user.totalEnergyPurchased
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error buyEnergy:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

// ─────────────────────────────────────────────
// GET USER ENERGY BALANCE
// GET /api/agents/energy-balance
// ─────────────────────────────────────────────
const getEnergyBalance = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    let user;
    if (userId) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      // For demo purposes, use default demo user
      user = await User.findOne({ email: 'demo@e-team.com' });
    }
    
    // Get current agent energy distribution
    const agents = await Agent.find({ status: 'active' });
    const totalAgentEnergy = agents.reduce((sum, agent) => sum + agent.energy, 0);
    
    // SYNCHRONIZE: User energy balance should equal total agent energy
    if (user && user.energyBalance !== totalAgentEnergy) {
      console.log(`🔄 [SYNC] Synchronizing user energy: ${user.energyBalance} → ${totalAgentEnergy}`);
      user.energyBalance = totalAgentEnergy;
      await user.save();
    }
    
    const energyBalance = totalAgentEnergy; // Use total agent energy as user energy
    const totalEnergyPurchased = user?.totalEnergyPurchased || 0;
    
    res.json({
      success: true,
      data: {
        userEnergyBalance: energyBalance,
        totalEnergyPurchased: totalEnergyPurchased,
        totalAgentEnergy: totalAgentEnergy,
        availableEnergy: energyBalance,
        lastEnergyPurchase: user?.lastEnergyPurchase || null,
        agents: agents.map(agent => ({
          id: agent._id,
          name: agent.name,
          displayName: agent.displayName,
          energy: agent.energy,
          maxEnergy: agent.maxEnergy,
          energyPercentage: agent.getEnergyPercentage()
        }))
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getEnergyBalance:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

// ─────────────────────────────────────────────
// USE ENERGY FROM USER BALANCE TO POWER AGENTS
// POST /api/agents/power-agents
// Body: { distributions: [{ agentId: "id1", energy: 50 }] }
// ─────────────────────────────────────────────
const powerAgents = async (req, res) => {
  try {
    const { distributions } = req.body;
    const userId = req.user?.id;
    
    if (!Array.isArray(distributions) || distributions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Distributions array is required'
      });
    }
    
    // Calculate total energy needed
    let totalEnergyNeeded = 0;
    for (const dist of distributions) {
      if (!dist.agentId || typeof dist.energy !== 'number' || dist.energy < 0) {
        return res.status(400).json({
          success: false,
          error: 'Each distribution must have agentId and positive energy value'
        });
      }
      totalEnergyNeeded += dist.energy;
    }
    
    // Check user energy balance
    let user;
    if (userId) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      // For demo purposes, use default demo user
      user = await User.findOne({ email: 'demo@e-team.com' });
    }
    
    const userEnergyBalance = user?.energyBalance || 0;
    
    if (userEnergyBalance < totalEnergyNeeded) {
      return res.status(400).json({
        success: false,
        error: `Insufficient energy balance. You have ${userEnergyBalance}, need ${totalEnergyNeeded}`,
        data: {
          userBalance: userEnergyBalance,
          energyNeeded: totalEnergyNeeded,
          shortfall: totalEnergyNeeded - userEnergyBalance
        }
      });
    }
    
    // Get agents and validate
    const agentIds = distributions.map(d => d.agentId);
    const agents = await Agent.find({ _id: { $in: agentIds } });
    
    if (agents.length !== distributions.length) {
      return res.status(404).json({
        success: false,
        error: 'One or more agents not found'
      });
    }
    
    // Check max energy limits
    for (const dist of distributions) {
      const agent = agents.find(a => a._id.toString() === dist.agentId);
      if (agent.energy + dist.energy > agent.maxEnergy) {
        return res.status(400).json({
          success: false,
          error: `Adding ${dist.energy} energy to ${agent.displayName} would exceed maximum energy (${agent.maxEnergy})`
        });
      }
    }
    
    // Deduct energy from user balance
    user.energyBalance -= totalEnergyNeeded;
    await user.save();
    
    // Add energy to agents
    const updateResults = [];
    for (const dist of distributions) {
      const agent = agents.find(a => a._id.toString() === dist.agentId);
      const oldEnergy = agent.energy;
      agent.addEnergy(dist.energy);
      agent.lastActivity = new Date();
      await agent.save();
      
      updateResults.push({
        id: agent._id,
        name: agent.name,
        displayName: agent.displayName,
        energy: agent.energy,
        maxEnergy: agent.maxEnergy,
        energyPercentage: agent.getEnergyPercentage(),
        previousEnergy: oldEnergy,
        energyAdded: dist.energy
      });
      
      console.log(`⚡ [POWER] ${agent.name} powered up: ${oldEnergy} → ${agent.energy} (+${dist.energy})`);
    }
    
    res.json({
      success: true,
      message: `Successfully powered ${distributions.length} agents`,
      data: {
        totalEnergyUsed: totalEnergyNeeded,
        userEnergyBalance: user.energyBalance,
        agents: updateResults
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error powerAgents:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

// ─────────────────────────────────────────────
// INITIALIZE AGENTS (Setup default agents)
// POST /api/agents/initialize
// ─────────────────────────────────────────────
const initializeAgents = async (req, res) => {
  try {
    // Check if agents already exist
    const existingAgents = await Agent.find();
    if (existingAgents.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Agents already initialized',
        data: {
          existingAgents: existingAgents.length
        }
      });
    }
    
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
    
    console.log(`🚀 [AGENTS] Initialized ${createdAgents.length} agents with total energy: ${totalEnergy}`);
    
    res.json({
      success: true,
      message: `Successfully initialized ${createdAgents.length} agents`,
      data: {
        agents: createdAgents.map(agent => ({
          id: agent._id,
          name: agent.name,
          displayName: agent.displayName,
          energy: agent.energy,
          maxEnergy: agent.maxEnergy,
          energyPercentage: agent.getEnergyPercentage(),
          specialties: agent.specialties,
          status: agent.status,
          readyStatus: agent.readyStatus
        })),
        totalEnergy: totalEnergy,
        agentCount: createdAgents.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error initializeAgents:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

// ─────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────

// Simulate payment processing (replace with real payment integration)
async function simulatePayment(amount, paymentMethod) {
  // Simulate payment delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Simulate 95% success rate
  const success = Math.random() > 0.05;
  
  if (success) {
    return {
      success: true,
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount: amount,
      paymentMethod: paymentMethod
    };
  } else {
    return {
      success: false,
      error: 'Payment declined by processor'
    };
  }
}

module.exports = {
  getAllAgents,
  getAgent,
  updateAgentEnergy,
  distributeEnergy,
  buyEnergy,
  getEnergyBalance,
  powerAgents,
  initializeAgents
};