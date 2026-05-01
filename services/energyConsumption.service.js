// =============================================================
//  SERVICE - Energy Consumption Management
// =============================================================

const Agent = require('../models/Agent');

class EnergyConsumptionService {
  
  // Energy costs for different task types (1-5 range)
  static ENERGY_COSTS = {
    // Communication tasks (1-2 energy)
    'EMAIL_SEND': 1,
    'NOTIFICATION': 1,
    'ABSENCE_ALERT': 2,
    'MESSAGE_PROCESS': 2,
    
    // Social media tasks (2-5 energy)
    'POST_SCHEDULING': 2,
    'SOCIAL_POST': 3,
    'CONTENT_GENERATION': 4,
    'IMAGE_GENERATION': 5,
    
    // HR tasks (2-5 energy)
    'ABSENCE_TRACKING': 2,
    'EMPLOYEE_ANALYSIS': 4,
    'PERFORMANCE_REVIEW': 5,
    'RECRUITMENT': 5,
    
    // Financial tasks (2-5 energy)
    'EXPENSE_TRACKING': 2,
    'PAYMENT_PROCESSING': 3,
    'BUDGET_ANALYSIS': 4,
    'FINANCIAL_REPORT': 5,
    
    // Document tasks (2-4 energy)
    'CLASSIFICATION': 2,
    'DOCUMENT_ANALYSIS': 3,
    'DATA_PROCESSING': 3,
    'EXTRACTION': 4,
    
    // Time management tasks (1-4 energy)
    'REMINDER_CREATION': 1,
    'CALENDAR_SYNC': 2,
    'TIME_TRACKING': 2,
    'SCHEDULE_OPTIMIZATION': 4,
    
    // Default for unknown tasks
    'DEFAULT': 2
  };

  /**
   * Consume energy for a task performed by an agent
   * @param {string} agentName - Name of the agent (dexo, echo, hera, kash, timo)
   * @param {string} taskType - Type of task performed
   * @param {string} taskDescription - Description of the task
   * @param {Object} metadata - Additional task metadata
   * @param {string} userId - User ID (optional, for user energy deduction)
   * @returns {Promise<Object>} Result of energy consumption
   */
  static async consumeEnergy(agentName, taskType, taskDescription, metadata = {}, userId = null) {
    try {
      console.log(`⚡ [ENERGY] Consuming energy for ${agentName} - ${taskType}`);
      console.log(`⚡ [ENERGY] userId provided: ${userId ? userId : 'NO USER ID'}`);
      
      // ✅ AGENT OWNERSHIP VALIDATION - Critical Security Check
      if (userId) {
        const { canUseAgent } = require('../utils/agentGuard');
        const guard = await canUseAgent(userId, agentName);
        
        if (!guard.canUse) {
          console.log(`⛔ ${agentName.toUpperCase()} blocked: User ${userId} hasn't purchased ${agentName.toUpperCase()} - ${guard.error}`);
          return {
            success: false,
            error: `Access denied: ${guard.error}`,
            blocked: true,
            agentName: agentName.toUpperCase(),
            userId: userId
          };
        }
        
        console.log(`✅ [ENERGY] Agent ownership verified: User ${userId} owns ${agentName.toUpperCase()}`);
      }
      
      // Find the agent
      const agent = await Agent.findOne({ name: agentName.toLowerCase() });
      if (!agent) {
        throw new Error(`Agent ${agentName} not found`);
      }
      
      // Calculate energy cost
      const energyCost = this.ENERGY_COSTS[taskType] || this.ENERGY_COSTS.DEFAULT;
      console.log(`⚡ [ENERGY] Energy cost for ${taskType}: ${energyCost}`);
      
      // Check if agent has enough energy (minimum 2 energy must remain)
      const MINIMUM_ENERGY = 2;
      const availableEnergy = agent.energy - MINIMUM_ENERGY;
      
      if (availableEnergy < energyCost) {
        console.log(`❌ [ENERGY] ${agent.displayName} has insufficient energy: ${agent.energy} (need ${energyCost} + ${MINIMUM_ENERGY} minimum = ${energyCost + MINIMUM_ENERGY})`);
        return {
          success: false,
          error: 'Insufficient agent energy (minimum 2 energy must remain)',
          agentName: agent.displayName,
          currentEnergy: agent.energy,
          requiredEnergy: energyCost,
          minimumRequired: MINIMUM_ENERGY,
          totalRequired: energyCost + MINIMUM_ENERGY,
          shortfall: (energyCost + MINIMUM_ENERGY) - agent.energy
        };
      }
      
      // If userId provided, also check and deduct from user's energy portfolio
      let userEnergyDeducted = false;
      let userPreviousEnergy = 0;
      let userNewEnergy = 0;
      
      if (userId) {
        console.log(`⚡ [ENERGY] Attempting to deduct from user portfolio: ${userId}`);
        const User = require('../models/User');
        const user = await User.findById(userId);
        
        if (user) {
          userPreviousEnergy = user.energyBalance || 0;
          console.log(`⚡ [ENERGY] User current energy balance: ${userPreviousEnergy}`);
          
          // ALWAYS deduct from user's energy portfolio to maintain synchronization
          // User energy should always equal total agent energy
          user.energyBalance = Math.max(0, user.energyBalance - energyCost);
          userNewEnergy = user.energyBalance;
          await user.save();
          userEnergyDeducted = true;
          
          console.log(`⚡ [ENERGY] User portfolio: ${userPreviousEnergy} → ${userNewEnergy} (-${energyCost})`);
        }
      }
      
      // Consume energy from agent
      const previousEnergy = agent.energy;
      agent.useEnergy(energyCost);
      agent.stats.tasksCompleted += 1;
      agent.lastActivity = new Date();
      
      await agent.save();
      
      console.log(`⚡ [ENERGY] ${agent.displayName} consumed ${energyCost} energy: ${previousEnergy} → ${agent.energy}`);
      
      // Log the energy consumption
      await this.logEnergyConsumption({
        agentName: agent.name,
        agentDisplayName: agent.displayName,
        taskType,
        taskDescription,
        energyCost,
        previousEnergy,
        newEnergy: agent.energy,
        userEnergyDeducted,
        userPreviousEnergy,
        userNewEnergy,
        userId,
        metadata,
        timestamp: new Date()
      });
      
      return {
        success: true,
        agentName: agent.displayName,
        taskType,
        energyCost,
        previousEnergy,
        newEnergy: agent.energy,
        energyPercentage: agent.getEnergyPercentage(),
        tasksCompleted: agent.stats.tasksCompleted,
        userEnergyDeducted,
        userPreviousEnergy,
        userNewEnergy
      };
      
    } catch (error) {
      console.error(`❌ [ENERGY] Error consuming energy:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Log energy consumption for tracking and analytics
   */
  static async logEnergyConsumption(logData) {
    try {
      // You could create a separate EnergyLog model for detailed tracking
      // For now, we'll just log to console and could extend to database later
      console.log(`📊 [ENERGY LOG] ${logData.agentDisplayName}: ${logData.taskType} (-${logData.energyCost} energy)`);
      console.log(`📊 [ENERGY LOG] Agent Energy: ${logData.previousEnergy} → ${logData.newEnergy}`);
      
      if (logData.userEnergyDeducted) {
        console.log(`📊 [ENERGY LOG] User Portfolio: ${logData.userPreviousEnergy} → ${logData.userNewEnergy} (-${logData.energyCost} energy)`);
      } else if (logData.userId) {
        console.log(`📊 [ENERGY LOG] User Portfolio: Insufficient energy or not found`);
      }
      
      console.log(`📊 [ENERGY LOG] Task: ${logData.taskDescription}`);
      
      // TODO: Save to EnergyLog collection for detailed analytics
      // const energyLog = new EnergyLog(logData);
      // await energyLog.save();
      
    } catch (error) {
      console.error(`❌ [ENERGY LOG] Error logging energy consumption:`, error);
    }
  }
  
  /**
   * Check if an agent has enough energy for a task
   */
  static async checkEnergyAvailability(agentName, taskType) {
    try {
      const agent = await Agent.findOne({ name: agentName.toLowerCase() });
      if (!agent) {
        return { available: false, error: 'Agent not found' };
      }
      
      const energyCost = this.ENERGY_COSTS[taskType] || this.ENERGY_COSTS.DEFAULT;
      const MINIMUM_ENERGY = 2;
      const availableEnergy = agent.energy - MINIMUM_ENERGY;
      const available = availableEnergy >= energyCost;
      
      return {
        available,
        currentEnergy: agent.energy,
        availableEnergy: availableEnergy,
        requiredEnergy: energyCost,
        minimumEnergy: MINIMUM_ENERGY,
        agentName: agent.displayName,
        energyPercentage: agent.getEnergyPercentage()
      };
      
    } catch (error) {
      return { available: false, error: error.message };
    }
  }
  
  /**
   * Get energy consumption statistics for an agent
   */
  static async getEnergyStats(agentName) {
    try {
      const agent = await Agent.findOne({ name: agentName.toLowerCase() });
      if (!agent) {
        throw new Error(`Agent ${agentName} not found`);
      }
      
      return {
        agentName: agent.displayName,
        currentEnergy: agent.energy,
        maxEnergy: agent.maxEnergy,
        energyPercentage: agent.getEnergyPercentage(),
        totalEnergyUsed: agent.stats.energyUsed,
        tasksCompleted: agent.stats.tasksCompleted,
        averageEnergyPerTask: agent.stats.tasksCompleted > 0 
          ? Math.round(agent.stats.energyUsed / agent.stats.tasksCompleted) 
          : 0,
        status: agent.status,
        readyStatus: agent.readyStatus,
        isReady: agent.isReady(),
        lastActivity: agent.lastActivity
      };
      
    } catch (error) {
      throw new Error(`Error getting energy stats: ${error.message}`);
    }
  }
}

module.exports = EnergyConsumptionService;