// =============================================================
//  CENTRALIZED ENERGY SERVICE - Security Wrapper
// =============================================================
// 
// This service provides secure wrappers around energy consumption
// to ensure proper agent ownership validation in all scenarios.
// 
// SECURITY RULES:
// 1. User-initiated actions MUST validate userId + agent ownership
// 2. Autonomous actions MUST find users who own the agent
// 3. NO energy consumption without proper ownership validation
// 4. Clear blocking responses when access is denied
//
// =============================================================

const { manualEnergyConsumption } = require('../../middleware/energyMiddleware');
const { canUseAgent, findUserWithAgentAndEnergy } = require('../../utils/agentGuard');

class CentralizedEnergyService {
  
  /**
   * Consume energy for user-initiated actions
   * SECURITY: Validates user owns the agent before consuming energy
   * 
   * @param {Object} params - Parameters object
   * @param {string} params.userId - User ID who initiated the action
   * @param {string} params.agentName - Agent performing the task (echo, hera, dexo, kash, timo)
   * @param {string} params.taskType - Type of task being performed
   * @param {string} params.taskDescription - Description of the task
   * @param {Object} params.metadata - Additional task metadata
   * @returns {Promise<Object>} Energy consumption result with security validation
   */
  static async consumeForUser({ userId, agentName, taskType, taskDescription, metadata = {} }) {
    try {
      console.log(`🔐 [CENTRALIZED ENERGY] User-initiated consumption: ${agentName} - ${taskType}`);
      console.log(`🔐 [CENTRALIZED ENERGY] User ID: ${userId}`);
      
      // ✅ MANDATORY: Validate userId exists
      if (!userId) {
        console.log('⛔ [CENTRALIZED ENERGY] BLOCKED: No userId provided for user-initiated action');
        return {
          success: false,
          blocked: true,
          error: 'User ID is required for user-initiated actions',
          securityReason: 'MISSING_USER_ID',
          agentName: agentName.toUpperCase(),
          taskType
        };
      }
      
      // ✅ MANDATORY: Validate agent ownership
      console.log(`🔍 [CENTRALIZED ENERGY] Validating ownership: User ${userId} → Agent ${agentName.toUpperCase()}`);
      const ownershipCheck = await canUseAgent(userId, agentName);
      
      if (!ownershipCheck.canUse) {
        console.log(`⛔ [CENTRALIZED ENERGY] BLOCKED: ${ownershipCheck.error}`);
        return {
          success: false,
          blocked: true,
          error: `Access denied: ${ownershipCheck.error}`,
          securityReason: 'AGENT_NOT_OWNED',
          agentName: agentName.toUpperCase(),
          userId: userId,
          taskType
        };
      }
      
      console.log(`✅ [CENTRALIZED ENERGY] Ownership validated: User ${userId} owns ${agentName.toUpperCase()}`);
      
      // ✅ SECURE: Call existing energy consumption with validated userId
      const result = await manualEnergyConsumption(
        agentName,
        taskType,
        taskDescription,
        {
          ...metadata,
          securityValidated: true,
          validationMethod: 'user-initiated',
          validatedAt: new Date().toISOString()
        },
        userId
      );
      
      if (result.success) {
        console.log(`⚡ [CENTRALIZED ENERGY] SUCCESS: ${agentName.toUpperCase()} consumed ${result.energyCost} energy for user ${userId}`);
      } else {
        console.log(`⚠️ [CENTRALIZED ENERGY] FAILED: ${result.error}`);
      }
      
      return {
        ...result,
        securityValidated: true,
        validationMethod: 'user-initiated'
      };
      
    } catch (error) {
      console.error('❌ [CENTRALIZED ENERGY] Error in consumeForUser:', error);
      return {
        success: false,
        blocked: true,
        error: `Security validation error: ${error.message}`,
        securityReason: 'VALIDATION_ERROR',
        agentName: agentName.toUpperCase(),
        taskType
      };
    }
  }
  
  /**
   * Consume energy for autonomous operations (cron jobs, background tasks)
   * SECURITY: Finds users who own the agent AND have energy before consuming
   * 
   * @param {Object} params - Parameters object
   * @param {string} params.agentName - Agent performing the task (echo, hera, dexo, kash, timo)
   * @param {string} params.taskType - Type of task being performed
   * @param {string} params.taskDescription - Description of the task
   * @param {Object} params.metadata - Additional task metadata
   * @returns {Promise<Object>} Energy consumption result with security validation
   */
  static async consumeForAutonomous({ agentName, taskType, taskDescription, metadata = {} }) {
    try {
      console.log(`🤖 [CENTRALIZED ENERGY] Autonomous consumption: ${agentName} - ${taskType}`);
      
      // ✅ MANDATORY: Find user who owns the agent AND has energy
      console.log(`🔍 [CENTRALIZED ENERGY] Finding user with ${agentName.toUpperCase()} agent and energy...`);
      const userCheck = await findUserWithAgentAndEnergy(agentName);
      
      if (!userCheck.hasAgent || !userCheck.userId) {
        console.log(`⛔ [CENTRALIZED ENERGY] BLOCKED: No users own ${agentName.toUpperCase()} agent or have energy`);
        return {
          success: false,
          blocked: true,
          error: `No users have purchased ${agentName.toUpperCase()} agent or have sufficient energy`,
          securityReason: 'NO_AGENT_OWNERS_WITH_ENERGY',
          agentName: agentName.toUpperCase(),
          taskType,
          autonomousOperation: true
        };
      }
      
      const userId = userCheck.userId;
      console.log(`✅ [CENTRALIZED ENERGY] Found user with ${agentName.toUpperCase()}: ${userId} (Energy: ${userCheck.user?.energyBalance || 'Unknown'})`);
      
      // ✅ SECURE: Call existing energy consumption with validated userId
      const result = await manualEnergyConsumption(
        agentName,
        taskType,
        taskDescription,
        {
          ...metadata,
          securityValidated: true,
          validationMethod: 'autonomous',
          validatedUserId: userId,
          validatedAt: new Date().toISOString()
        },
        userId
      );
      
      if (result.success) {
        console.log(`⚡ [CENTRALIZED ENERGY] SUCCESS: ${agentName.toUpperCase()} consumed ${result.energyCost} energy from user ${userId} (autonomous)`);
      } else if (result.blocked) {
        console.log(`⛔ [CENTRALIZED ENERGY] BLOCKED: ${result.error} (autonomous)`);
      } else {
        console.log(`⚠️ [CENTRALIZED ENERGY] FAILED: ${result.error} (autonomous)`);
      }
      
      return {
        ...result,
        securityValidated: true,
        validationMethod: 'autonomous',
        validatedUserId: userId,
        autonomousOperation: true
      };
      
    } catch (error) {
      console.error('❌ [CENTRALIZED ENERGY] Error in consumeForAutonomous:', error);
      return {
        success: false,
        blocked: true,
        error: `Autonomous security validation error: ${error.message}`,
        securityReason: 'AUTONOMOUS_VALIDATION_ERROR',
        agentName: agentName.toUpperCase(),
        taskType,
        autonomousOperation: true
      };
    }
  }
  
  /**
   * Check if a user can use a specific agent (validation only, no energy consumption)
   * Wrapper around existing canUseAgent function
   * 
   * @param {string} userId - User ID to check
   * @param {string} agentName - Agent name to verify (echo, hera, dexo, kash, timo)
   * @returns {Promise<Object>} Ownership validation result
   */
  static async canUserUseAgent(userId, agentName) {
    try {
      console.log(`🔍 [CENTRALIZED ENERGY] Checking ownership: User ${userId} → Agent ${agentName.toUpperCase()}`);
      
      if (!userId) {
        console.log('⛔ [CENTRALIZED ENERGY] No userId provided for ownership check');
        return {
          canUse: false,
          error: 'User ID is required for ownership validation',
          securityReason: 'MISSING_USER_ID',
          agentName: agentName.toUpperCase()
        };
      }
      
      const result = await canUseAgent(userId, agentName);
      
      if (result.canUse) {
        console.log(`✅ [CENTRALIZED ENERGY] Ownership confirmed: User ${userId} owns ${agentName.toUpperCase()}`);
      } else {
        console.log(`⛔ [CENTRALIZED ENERGY] Ownership denied: ${result.error}`);
      }
      
      return {
        ...result,
        agentName: agentName.toUpperCase(),
        securityValidated: true,
        validatedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ [CENTRALIZED ENERGY] Error in canUserUseAgent:', error);
      return {
        canUse: false,
        error: `Ownership validation error: ${error.message}`,
        securityReason: 'OWNERSHIP_VALIDATION_ERROR',
        agentName: agentName.toUpperCase()
      };
    }
  }
  
  /**
   * Find users who own a specific agent and have energy (for autonomous operations)
   * Wrapper around existing findUserWithAgentAndEnergy function
   * 
   * @param {string} agentName - Agent name to search for (echo, hera, dexo, kash, timo)
   * @returns {Promise<Object>} User search result with ownership and energy validation
   */
  static async findUsersWithAgentAndEnergy(agentName) {
    try {
      console.log(`🔍 [CENTRALIZED ENERGY] Searching for users with ${agentName.toUpperCase()} agent and energy...`);
      
      const result = await findUserWithAgentAndEnergy(agentName);
      
      if (result.hasAgent && result.userId) {
        console.log(`✅ [CENTRALIZED ENERGY] Found user with ${agentName.toUpperCase()}: ${result.userId}`);
      } else {
        console.log(`⛔ [CENTRALIZED ENERGY] No users found with ${agentName.toUpperCase()} agent and energy`);
      }
      
      return {
        ...result,
        agentName: agentName.toUpperCase(),
        securityValidated: true,
        validatedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ [CENTRALIZED ENERGY] Error in findUsersWithAgentAndEnergy:', error);
      return {
        userId: null,
        user: null,
        hasAgent: false,
        error: `User search error: ${error.message}`,
        securityReason: 'USER_SEARCH_ERROR',
        agentName: agentName.toUpperCase()
      };
    }
  }
  
  /**
   * Get security validation statistics (for monitoring and debugging)
   * 
   * @returns {Object} Security statistics and validation info
   */
  static getSecurityInfo() {
    return {
      serviceName: 'CentralizedEnergyService',
      version: '1.0.0',
      securityFeatures: [
        'Mandatory agent ownership validation',
        'User-initiated action protection',
        'Autonomous operation security',
        'Energy theft prevention',
        'Clear blocking responses'
      ],
      validationMethods: [
        'user-initiated: Validates userId + agent ownership',
        'autonomous: Finds users with agent + energy'
      ],
      supportedAgents: ['echo', 'hera', 'dexo', 'kash', 'timo'],
      dependencies: [
        'middleware/energyMiddleware.manualEnergyConsumption',
        'utils/agentGuard.canUseAgent',
        'utils/agentGuard.findUserWithAgentAndEnergy'
      ],
      securityLevel: 'HIGH',
      backwardCompatible: true,
      createdAt: new Date().toISOString()
    };
  }
}

module.exports = CentralizedEnergyService;