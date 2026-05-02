// =============================================================
//  CONTROLLER - Activity Log
// =============================================================

const ActivityLogger = require('../services/shared/activityLogger.service');
const ActivityLog = require('../models/ActivityLog');

/**
 * Get recent activities
 * GET /api/activities
 */
exports.getActivities = async (req, res) => {
  try {
    const { limit = 50, sourceAgent, targetAgent, actionType, status, priority } = req.query;
    
    const filters = {};
    if (sourceAgent) filters.sourceAgent = sourceAgent.toLowerCase();
    if (targetAgent) filters.targetAgent = targetAgent.toLowerCase();
    if (actionType) filters.actionType = actionType;
    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    
    const activities = await ActivityLogger.getRecentActivities(parseInt(limit), filters);
    
    res.json({
      success: true,
      total: activities.length,
      activities: activities
    });
  } catch (error) {
    console.error('❌ Error getActivities:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Get activities by agent
 * GET /api/activities/agent/:agentName
 */
exports.getActivitiesByAgent = async (req, res) => {
  try {
    const { agentName } = req.params;
    const { limit = 50 } = req.query;
    
    const activities = await ActivityLogger.getActivitiesByAgent(agentName, parseInt(limit));
    
    res.json({
      success: true,
      agent: agentName,
      total: activities.length,
      activities: activities
    });
  } catch (error) {
    console.error('❌ Error getActivitiesByAgent:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Get activity statistics
 * GET /api/activities/statistics
 */
exports.getStatistics = async (req, res) => {
  try {
    const { timeRange = 24 } = req.query;
    
    const stats = await ActivityLogger.getStatistics(parseInt(timeRange));
    
    // Calculate totals
    const totalActivities = stats.reduce((sum, agent) => sum + agent.totalActivities, 0);
    const totalEnergy = stats.reduce((sum, agent) => sum + agent.totalEnergyConsumed, 0);
    
    res.json({
      success: true,
      timeRange: `${timeRange} hours`,
      summary: {
        totalActivities,
        totalEnergyConsumed: totalEnergy,
        agentCount: stats.length
      },
      byAgent: stats
    });
  } catch (error) {
    console.error('❌ Error getStatistics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Get mobile-friendly activity feed
 * GET /api/activities/mobile/feed
 */
exports.getMobileFeed = async (req, res) => {
  try {
    const { page = 1, limit = 20, agentFilter } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get activities from NEW system (ActivityLog)
    const query = {};
    if (agentFilter && agentFilter !== 'all') {
      query.sourceAgent = agentFilter.toLowerCase();
    }
    
    const newActivities = await ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .lean();
    
    // Get activities from OLD system (HeraAction + Task)
    let oldActivities = [];
    
    try {
      const HeraAction = require('../models/HeraAction');
      const Task = require('../models/Task');
      
      // Get Hera actions
      const heraActions = await HeraAction.find()
        .populate('employee_id', 'name')
        .sort({ created_at: -1 })
        .lean();
      
      // Get Timo tasks (meetings)
      const timoTasks = await Task.find({ category: 'meeting' })
        .sort({ deadline: -1 })
        .lean();
      
      // Convert Hera actions to activity format
      heraActions.forEach(action => {
        let sourceAgent = 'hera';
        let actionType = 'STAFFING_ALERT';
        let title = `${action.action_type} for ${action.employee_id?.name || 'employee'}`;
        let description = `Hera processed ${action.action_type}`;
        
        if (action.action_type === 'doc_request') {
          sourceAgent = 'dexo';
          actionType = 'DATA_PROCESSING';
          title = `Generated ${action.details?.docType || 'document'} for ${action.employee_id?.name || 'employee'}`;
          description = `Dexo generated ${action.details?.document || 'document'} and sent via email`;
        }
        
        // Apply agent filter
        if (!agentFilter || agentFilter === 'all' || sourceAgent === agentFilter.toLowerCase()) {
          oldActivities.push({
            id: action._id,
            sourceAgent: sourceAgent,
            targetAgent: sourceAgent === 'dexo' ? 'hera' : 'external',
            actionType: actionType,
            title: title,
            description: description,
            status: 'success',
            energyConsumed: sourceAgent === 'dexo' ? 8 : 5,
            priority: 'medium',
            timestamp: action.created_at,
            logEntry: `${sourceAgent.toUpperCase()}${sourceAgent === 'dexo' ? '→HERA' : ''}: ${actionType}`,
            icon: getActionIcon(actionType),
            color: getStatusColor('success'),
            source: 'old_system'
          });
        }
      });
      
      // Convert Timo tasks to activity format
      timoTasks.forEach(task => {
        // Apply agent filter
        if (!agentFilter || agentFilter === 'all' || agentFilter.toLowerCase() === 'timo') {
          oldActivities.push({
            id: task._id,
            sourceAgent: 'timo',
            targetAgent: 'hera',
            actionType: 'MEETING_SCHEDULED',
            title: task.title,
            description: task.description,
            status: task.status === 'todo' ? 'pending' : 'success',
            energyConsumed: 5,
            priority: task.priority || 'medium',
            timestamp: task.deadline,
            logEntry: `TIMO→HERA: MEETING_SCHEDULED`,
            icon: getActionIcon('MEETING_SCHEDULED'),
            color: getStatusColor(task.status === 'todo' ? 'pending' : 'success'),
            source: 'old_system'
          });
        }
      });
    } catch (oldSystemError) {
      console.warn('⚠️ Could not load old system data:', oldSystemError.message);
    }
    
    // Format new activities
    const formattedNewActivities = newActivities.map(activity => ({
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
      logEntry: `${activity.sourceAgent.toUpperCase()}${activity.targetAgent ? '→' + activity.targetAgent.toUpperCase() : ''}: ${activity.actionType}`,
      icon: getActionIcon(activity.actionType),
      color: getStatusColor(activity.status),
      source: 'new_system'
    }));
    
    // Combine and sort all activities
    const allActivities = [...formattedNewActivities, ...oldActivities]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply pagination
    const totalActivities = allActivities.length;
    const paginatedActivities = allActivities.slice(skip, skip + parseInt(limit));
    
    res.json({
      success: true,
      data: {
        activities: paginatedActivities,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalActivities / parseInt(limit)),
          totalActivities: totalActivities,
          hasNext: skip + parseInt(limit) < totalActivities,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getMobileFeed:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Get activity dashboard for mobile
 * GET /api/activities/mobile/dashboard
 */
exports.getMobileDashboard = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Get statistics from NEW system
    const [
      newTotalActivities,
      newActivitiesLast24h,
      newSuccessfulActivities,
      newFailedActivities,
      newTotalEnergyConsumed,
      newRecentActivities
    ] = await Promise.all([
      ActivityLog.countDocuments(),
      ActivityLog.countDocuments({ timestamp: { $gte: last24h } }),
      ActivityLog.countDocuments({ status: 'success' }),
      ActivityLog.countDocuments({ status: 'failed' }),
      ActivityLog.aggregate([
        { $group: { _id: null, total: { $sum: '$energyConsumed' } } }
      ]),
      ActivityLog.find()
        .sort({ timestamp: -1 })
        .limit(5)
        .lean()
    ]);
    
    // Get statistics from OLD system
    let oldSystemStats = {
      totalActivities: 0,
      activitiesLast24h: 0,
      successfulActivities: 0,
      failedActivities: 0,
      totalEnergyConsumed: 0,
      recentActivities: []
    };
    
    try {
      const HeraAction = require('../models/HeraAction');
      const Task = require('../models/Task');
      
      // Count Hera actions
      const heraActionsTotal = await HeraAction.countDocuments();
      const heraActionsLast24h = await HeraAction.countDocuments({ created_at: { $gte: last24h } });
      const recentHeraActions = await HeraAction.find()
        .populate('employee_id', 'name')
        .sort({ created_at: -1 })
        .limit(3)
        .lean();
      
      // Count Timo tasks
      const timoTasksTotal = await Task.countDocuments({ category: 'meeting' });
      const timoTasksLast24h = await Task.countDocuments({ 
        category: 'meeting',
        deadline: { $gte: last24h }
      });
      const recentTimoTasks = await Task.find({ category: 'meeting' })
        .sort({ deadline: -1 })
        .limit(2)
        .lean();
      
      oldSystemStats = {
        totalActivities: heraActionsTotal + timoTasksTotal,
        activitiesLast24h: heraActionsLast24h + timoTasksLast24h,
        successfulActivities: heraActionsTotal + timoTasksTotal, // Assume all successful
        failedActivities: 0,
        totalEnergyConsumed: (heraActionsTotal * 5) + (timoTasksTotal * 5), // Estimate energy
        recentActivities: [
          ...recentHeraActions.map(action => ({
            id: action._id,
            logEntry: `HERA: STAFFING_ALERT`,
            title: `${action.action_type} for ${action.employee_id?.name || 'employee'}`,
            status: 'success',
            timestamp: action.created_at,
            energyConsumed: 5
          })),
          ...recentTimoTasks.map(task => ({
            id: task._id,
            logEntry: `TIMO→HERA: MEETING_SCHEDULED`,
            title: task.title,
            status: task.status === 'todo' ? 'pending' : 'success',
            timestamp: task.deadline,
            energyConsumed: 5
          }))
        ]
      };
    } catch (oldSystemError) {
      console.warn('⚠️ Could not load old system stats:', oldSystemError.message);
    }
    
    // Combine statistics
    const totalActivities = newTotalActivities + oldSystemStats.totalActivities;
    const activitiesLast24h = newActivitiesLast24h + oldSystemStats.activitiesLast24h;
    const successfulActivities = newSuccessfulActivities + oldSystemStats.successfulActivities;
    const failedActivities = newFailedActivities + oldSystemStats.failedActivities;
    const totalEnergyConsumed = (newTotalEnergyConsumed[0]?.total || 0) + oldSystemStats.totalEnergyConsumed;
    
    // Format new activities
    const formattedNewActivities = newRecentActivities.map(activity => ({
      id: activity._id,
      logEntry: `${activity.sourceAgent.toUpperCase()}${activity.targetAgent ? '→' + activity.targetAgent.toUpperCase() : ''}: ${activity.actionType}`,
      title: activity.title,
      status: activity.status,
      timestamp: activity.timestamp,
      energyConsumed: activity.energyConsumed
    }));
    
    // Combine and sort recent activities
    const allRecentActivities = [...formattedNewActivities, ...oldSystemStats.recentActivities]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);
    
    // Get activities by agent (combine both systems)
    const newActivitiesByAgent = await ActivityLog.aggregate([
      { $match: { timestamp: { $gte: last24h } } },
      {
        $group: {
          _id: '$sourceAgent',
          count: { $sum: 1 },
          energyConsumed: { $sum: '$energyConsumed' }
        }
      }
    ]);
    
    // Add old system agent stats
    const agentStatsMap = {};
    newActivitiesByAgent.forEach(agent => {
      agentStatsMap[agent._id] = {
        activities: agent.count,
        energyConsumed: agent.energyConsumed
      };
    });
    
    // Add estimated old system stats
    if (oldSystemStats.totalActivities > 0) {
      // Estimate distribution
      agentStatsMap.hera = agentStatsMap.hera || { activities: 0, energyConsumed: 0 };
      agentStatsMap.hera.activities += Math.floor(oldSystemStats.activitiesLast24h * 0.7); // 70% to Hera
      agentStatsMap.hera.energyConsumed += Math.floor(oldSystemStats.activitiesLast24h * 0.7 * 5);
      
      agentStatsMap.dexo = agentStatsMap.dexo || { activities: 0, energyConsumed: 0 };
      agentStatsMap.dexo.activities += Math.floor(oldSystemStats.activitiesLast24h * 0.2); // 20% to Dexo
      agentStatsMap.dexo.energyConsumed += Math.floor(oldSystemStats.activitiesLast24h * 0.2 * 8);
      
      agentStatsMap.timo = agentStatsMap.timo || { activities: 0, energyConsumed: 0 };
      agentStatsMap.timo.activities += Math.floor(oldSystemStats.activitiesLast24h * 0.1); // 10% to Timo
      agentStatsMap.timo.energyConsumed += Math.floor(oldSystemStats.activitiesLast24h * 0.1 * 5);
    }
    
    const combinedByAgent = Object.keys(agentStatsMap).map(agent => ({
      agent: agent,
      activities: agentStatsMap[agent].activities,
      energyConsumed: agentStatsMap[agent].energyConsumed
    }));
    
    res.json({
      success: true,
      data: {
        overview: {
          totalActivities,
          activitiesLast24h,
          successfulActivities,
          failedActivities,
          successRate: totalActivities > 0 ? Math.round((successfulActivities / totalActivities) * 100) : 0,
          totalEnergyConsumed
        },
        byAgent: combinedByAgent,
        recentActivities: allRecentActivities
      }
    });
  } catch (error) {
    console.error('❌ Error getMobileDashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

// Helper functions
function getActionIcon(actionType) {
  const icons = {
    'ABSENCE_ALERT': '🚨',
    'EMAIL_SEND': '📧',
    'EMAIL_REPLY': '↩️',
    'SOCIAL_POST': '📱',
    'CONTENT_GENERATION': '✍️',
    'IMAGE_GENERATION': '🎨',
    'RECRUITMENT': '👥',
    'STAFFING_ALERT': '⚠️',
    'PAYMENT_PROCESSING': '💰',
    'DOCUMENT_ANALYSIS': '📄',
    'DATA_PROCESSING': '📄',
    'VOCAL_MESSAGE': '🎤',
    'SCHEDULE_OPTIMIZATION': '📅',
    'MEETING_SCHEDULED': '📅',
    'CALENDAR_SYNC': '🔄',
    'TASK_COMPLETED': '✅',
    'ERROR_OCCURRED': '❌'
  };
  return icons[actionType] || '📝';
}

function getStatusColor(status) {
  const colors = {
    'success': '#4CAF50',
    'failed': '#F44336',
    'pending': '#FF9800',
    'in_progress': '#2196F3',
    'cancelled': '#9E9E9E'
  };
  return colors[status] || '#9E9E9E';
}

// Functions are already exported using exports.functionName above
