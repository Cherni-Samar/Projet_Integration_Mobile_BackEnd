// utils/agentGuard.js
const User = require('../models/User');

/**
 * Reusable agent ownership guard
 * Checks if a user has purchased/hired a specific agent
 * 
 * @param {string} userId - User ID to check
 * @param {string} agentName - Agent name to verify (hera, echo, timo, dexo, kash)
 * @returns {Promise<{canUse: boolean, user?: Object, error?: string}>}
 */
async function canUseAgent(userId, agentName) {
  try {
    if (!userId) {
      return {
        canUse: false,
        error: 'No user ID provided'
      };
    }

    if (!agentName) {
      return {
        canUse: false,
        error: 'No agent name provided'
      };
    }

    // Normalize agent name
    const normalizedAgentName = agentName.toLowerCase().trim();
    const validAgents = ['hera', 'echo', 'timo', 'dexo', 'kash'];
    
    if (!validAgents.includes(normalizedAgentName)) {
      return {
        canUse: false,
        error: `Invalid agent name: ${agentName}`
      };
    }

    // Load user
    const user = await User.findById(userId);
    if (!user) {
      return {
        canUse: false,
        error: 'User not found'
      };
    }

    // Check if user has hired this agent
    const hasAgent = user.activeAgents && user.activeAgents.includes(normalizedAgentName);
    
    return {
      canUse: hasAgent,
      user: user,
      error: hasAgent ? null : `User has not purchased ${normalizedAgentName.toUpperCase()}`
    };

  } catch (error) {
    console.error('❌ [AGENT GUARD] Error checking agent ownership:', error);
    return {
      canUse: false,
      error: `Agent guard error: ${error.message}`
    };
  }
}

/**
 * Middleware-style guard for Express routes
 * Usage: router.post('/endpoint', agentGuardMiddleware('echo'), controller)
 */
function agentGuardMiddleware(agentName) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId || req.user?._id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const guard = await canUseAgent(userId, agentName);
      
      if (!guard.canUse) {
        console.log(`⛔ ${agentName.toUpperCase()} blocked: User ${userId} hasn't purchased ${agentName.toUpperCase()} - ${guard.error}`);
        return res.status(403).json({
          success: false,
          message: `Access denied: ${guard.error}`,
          requiredAgent: agentName.toUpperCase()
        });
      }

      // Add user to request for downstream use
      req.guardedUser = guard.user;
      next();

    } catch (error) {
      console.error('❌ [AGENT GUARD MIDDLEWARE] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Agent guard error'
      });
    }
  };
}

/**
 * Helper to find a user with energy for autonomous operations
 * Prioritizes users who have purchased the specific agent
 * 
 * @param {string} agentName - Agent name (hera, echo, timo, dexo, kash)
 * @returns {Promise<{userId: string|null, user: Object|null, hasAgent: boolean}>}
 */
async function findUserWithAgentAndEnergy(agentName) {
  try {
    const normalizedAgentName = agentName.toLowerCase().trim();
    
    // First, try to find users who have purchased this agent AND have energy
    const userWithAgentAndEnergy = await User.findOne({
      activeAgents: normalizedAgentName,
      energyBalance: { $gt: 0 }
    }).sort({ energyBalance: -1 });

    if (userWithAgentAndEnergy) {
      return {
        userId: userWithAgentAndEnergy._id.toString(),
        user: userWithAgentAndEnergy,
        hasAgent: true
      };
    }

    // If no user with agent has energy, return null (don't use agent)
    console.log(`⛔ ${agentName.toUpperCase()} autonomous operation blocked: No users with ${agentName.toUpperCase()} agent have energy`);
    return {
      userId: null,
      user: null,
      hasAgent: false
    };

  } catch (error) {
    console.error('❌ [AGENT GUARD] Error finding user with agent and energy:', error);
    return {
      userId: null,
      user: null,
      hasAgent: false
    };
  }
}

module.exports = {
  canUseAgent,
  agentGuardMiddleware,
  findUserWithAgentAndEnergy
};