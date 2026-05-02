// =============================================================
//  MIDDLEWARE - Energy Consumption Tracking
// =============================================================

const EnergyConsumptionService = require('../services/energy/energyConsumption.service');

/**
 * Middleware to automatically consume energy when agents perform tasks
 * Usage: Add this middleware to routes where agents perform work
 */
const consumeEnergyMiddleware = (agentName, taskType) => {
  return async (req, res, next) => {
    try {
      // Store original res.json to intercept successful responses
      const originalJson = res.json;
      
      res.json = function(data) {
        // Only consume energy if the operation was successful
        if (data && data.success === true) {
          // Consume energy asynchronously (don't block response)
          setImmediate(async () => {
            try {
              const taskDescription = data.message || `${taskType} task completed`;
              const metadata = {
                endpoint: req.originalUrl,
                method: req.method,
                userId: req.user?.id,
                timestamp: new Date(),
                responseData: data
              };
              
              const result = await EnergyConsumptionService.consumeEnergy(
                agentName,
                taskType,
                taskDescription,
                metadata,
                req.user?.id // Pass userId for user energy deduction
              );
              
              if (!result.success) {
                console.log(`⚠️ [ENERGY] Failed to consume energy: ${result.error}`);
              }
            } catch (error) {
              console.error(`❌ [ENERGY] Error in energy consumption middleware:`, error);
            }
          });
        }
        
        // Call original res.json with the data
        return originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      console.error(`❌ [ENERGY] Error in energy middleware:`, error);
      next(); // Continue even if energy middleware fails
    }
  };
};

/**
 * Middleware to check energy availability before allowing task execution
 */
const checkEnergyMiddleware = (agentName, taskType) => {
  return async (req, res, next) => {
    try {
      const energyCheck = await EnergyConsumptionService.checkEnergyAvailability(agentName, taskType);
      
      if (!energyCheck.available) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient agent energy',
          details: {
            agentName: energyCheck.agentName,
            currentEnergy: energyCheck.currentEnergy,
            requiredEnergy: energyCheck.requiredEnergy,
            message: `${energyCheck.agentName} needs ${energyCheck.requiredEnergy} energy but only has ${energyCheck.currentEnergy}`
          }
        });
      }
      
      // Add energy info to request for use in route handlers
      req.energyInfo = energyCheck;
      next();
    } catch (error) {
      console.error(`❌ [ENERGY] Error checking energy availability:`, error);
      next(); // Continue even if energy check fails
    }
  };
};

/**
 * Helper function to manually consume energy (for use in existing code)
 */
const manualEnergyConsumption = async (agentName, taskType, taskDescription, metadata = {}, userId = null) => {
  try {
    console.log(`🔍 [MANUAL ENERGY] Called with userId: ${userId}`);
    console.log(`🔍 [MANUAL ENERGY] Arguments:`, { agentName, taskType, taskDescription, metadata, userId });
    return await EnergyConsumptionService.consumeEnergy(agentName, taskType, taskDescription, metadata, userId);
  } catch (error) {
    console.error(`❌ [ENERGY] Manual energy consumption error:`, error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  consumeEnergyMiddleware,
  checkEnergyMiddleware,
  manualEnergyConsumption
};