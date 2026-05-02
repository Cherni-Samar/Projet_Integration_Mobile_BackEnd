// =============================================================
//  SERVICE - Activity Logger (Centralized Agent Activity Tracking)
// =============================================================

const ActivityLog = require('../../models/ActivityLog');

class ActivityLoggerService {
  
  /**
   * Log an agent activity
   * @param {Object} data - Activity data
   * @returns {Promise<Object>} - Logged activity
   */
  static async log(data) {
    try {
      const {
        sourceAgent,
        targetAgent,
        actionType,
        title,
        description,
        status = 'success',
        energyConsumed = 0,
        priority = 'medium',
        metadata = {}
      } = data;
      
      // Validate required fields
      if (!sourceAgent || !actionType || !title) {
        console.error('❌ [ACTIVITY LOGGER] Missing required fields');
        return null;
      }
      
      // Create activity log
      const activity = await ActivityLog.logActivity({
        sourceAgent,
        targetAgent,
        actionType,
        title,
        description,
        status,
        energyConsumed,
        priority,
        metadata,
        timestamp: new Date()
      });
      
      if (activity) {
        // Format log entry for console
        const logEntry = this.formatLogEntry(activity);
        console.log(`📝 ${logEntry}`);
      }
      
      return activity;
    } catch (error) {
      console.error('❌ [ACTIVITY LOGGER] Error:', error.message);
      return null;
    }
  }
  
  /**
   * Format log entry for display
   */
  static formatLogEntry(activity) {
    const source = activity.sourceAgent.toUpperCase();
    const target = activity.targetAgent ? `→${activity.targetAgent.toUpperCase()}` : '';
    const action = activity.actionType;
    const status = activity.status.toUpperCase();
    const energy = activity.energyConsumed > 0 ? ` (-${activity.energyConsumed} energy)` : '';
    
    return `[${source}${target}] ${action} [${status}]${energy}: ${activity.title}`;
  }
  
  /**
   * Log Hera activity
   */
  static async logHeraActivity(actionType, title, options = {}) {
    return await this.log({
      sourceAgent: 'hera',
      actionType,
      title,
      ...options
    });
  }
  
  /**
   * Log Echo activity
   */
  static async logEchoActivity(actionType, title, options = {}) {
    return await this.log({
      sourceAgent: 'echo',
      actionType,
      title,
      ...options
    });
  }
  
  /**
   * Log Dexo activity
   */
  static async logDexoActivity(actionType, title, options = {}) {
    return await this.log({
      sourceAgent: 'dexo',
      actionType,
      title,
      ...options
    });
  }
  
  /**
   * Log Kash activity
   */
  static async logKashActivity(actionType, title, options = {}) {
    return await this.log({
      sourceAgent: 'kash',
      actionType,
      title,
      ...options
    });
  }
  
  /**
   * Log Timo activity
   */
  static async logTimoActivity(actionType, title, options = {}) {
    return await this.log({
      sourceAgent: 'timo',
      actionType,
      title,
      ...options
    });
  }
  
  /**
   * Get recent activities for mobile app
   */
  static async getRecentActivities(limit = 50, filters = {}) {
    try {
      const activities = await ActivityLog.getRecentActivities(limit, filters);
      
      return activities.map(activity => ({
        id: activity._id,
        sourceAgent: activity.sourceAgent,
        targetAgent: activity.targetAgent,
        actionType: activity.actionType,
        title: activity.title,
        description: activity.description,
        status: activity.status,
        energyConsumed: activity.energyConsumed,
        priority: activity.priority,
        timestamp: activity.timestamp,
        metadata: activity.metadata,
        logEntry: `${activity.sourceAgent.toUpperCase()}${activity.targetAgent ? '→' + activity.targetAgent.toUpperCase() : ''}: ${activity.actionType}`
      }));
    } catch (error) {
      console.error('❌ [ACTIVITY LOGGER] Error getting activities:', error.message);
      return [];
    }
  }
  
  /**
   * Get activity statistics
   */
  static async getStatistics(timeRange = 24) {
    try {
      return await ActivityLog.getStatistics(timeRange);
    } catch (error) {
      console.error('❌ [ACTIVITY LOGGER] Error getting statistics:', error.message);
      return [];
    }
  }
  
  /**
   * Get activities by agent
   */
  static async getActivitiesByAgent(agentName, limit = 50) {
    try {
      return await this.getRecentActivities(limit, { sourceAgent: agentName.toLowerCase() });
    } catch (error) {
      console.error('❌ [ACTIVITY LOGGER] Error getting agent activities:', error.message);
      return [];
    }
  }
  
  /**
   * Get activities by action type
   */
  static async getActivitiesByType(actionType, limit = 50) {
    try {
      return await this.getRecentActivities(limit, { actionType });
    } catch (error) {
      console.error('❌ [ACTIVITY LOGGER] Error getting activities by type:', error.message);
      return [];
    }
  }
}

module.exports = ActivityLoggerService;
