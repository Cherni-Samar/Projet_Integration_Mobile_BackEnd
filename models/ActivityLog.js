// =============================================================
//  MODEL - Activity Log (Agent Actions Tracking)
// =============================================================

const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  // Agent information
  sourceAgent: {
    type: String,
    required: true,
    enum: ['hera', 'echo', 'dexo', 'kash', 'timo', 'system'],
    lowercase: true
  },
  
  targetAgent: {
    type: String,
    enum: ['hera', 'echo', 'dexo', 'kash', 'timo', 'user', 'system', 'external'],
    lowercase: true
  },
  
  // Action details
  actionType: {
    type: String,
    required: true,
    enum: [
      // Communication actions
      'ABSENCE_ALERT',
      'EMAIL_SEND',
      'EMAIL_REPLY',
      'NOTIFICATION',
      'MESSAGE_PROCESS',
      
      // Social media actions
      'SOCIAL_POST',
      'CONTENT_GENERATION',
      'IMAGE_GENERATION',
      'POST_SCHEDULING',
      
      // HR actions
      'EMPLOYEE_ANALYSIS',
      'ABSENCE_TRACKING',
      'PERFORMANCE_REVIEW',
      'RECRUITMENT',
      'STAFFING_ALERT',
      
      // Financial actions
      'PAYMENT_PROCESSING',
      'BUDGET_ANALYSIS',
      'EXPENSE_TRACKING',
      'FINANCIAL_REPORT',
      'INVOICE_GENERATION',
      
      // Document actions
      'DOCUMENT_ANALYSIS',
      'DATA_PROCESSING',
      'CLASSIFICATION',
      'EXTRACTION',
      'VOCAL_MESSAGE',
      'REPORT_GENERATION',
      
      // Time management actions
      'SCHEDULE_OPTIMIZATION',
      'CALENDAR_SYNC',
      'REMINDER_CREATION',
      'TIME_TRACKING',
      'MEETING_SCHEDULED',
      
      // System actions
      'TASK_COMPLETED',
      'ERROR_OCCURRED',
      'SYSTEM_UPDATE'
    ]
  },
  
  // Action description
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  
  description: {
    type: String,
    maxlength: 1000
  },
  
  // Status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'in_progress', 'success', 'failed', 'cancelled'],
    default: 'success'
  },
  
  // Energy consumed
  energyConsumed: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Priority level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Metadata
  metadata: {
    department: String,
    userId: String,
    emailId: String,
    postId: String,
    documentId: String,
    taskId: String,
    platform: String,
    recipient: String,
    amount: Number,
    duration: Number, // in milliseconds
    errorMessage: String,
    additionalData: mongoose.Schema.Types.Mixed
  },
  
  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
activityLogSchema.index({ sourceAgent: 1, timestamp: -1 });
activityLogSchema.index({ targetAgent: 1, timestamp: -1 });
activityLogSchema.index({ actionType: 1, timestamp: -1 });
activityLogSchema.index({ status: 1, timestamp: -1 });
activityLogSchema.index({ timestamp: -1 });

// Virtual for formatted log entry
activityLogSchema.virtual('logEntry').get(function() {
  const source = this.sourceAgent.toUpperCase();
  const target = this.targetAgent ? `→${this.targetAgent.toUpperCase()}` : '';
  const action = this.actionType;
  const status = this.status.toUpperCase();
  
  return `${source}${target}: ${action} [${status}]`;
});

// Method to get formatted display
activityLogSchema.methods.getFormattedDisplay = function() {
  return {
    id: this._id,
    logEntry: this.logEntry,
    sourceAgent: this.sourceAgent,
    targetAgent: this.targetAgent,
    actionType: this.actionType,
    title: this.title,
    description: this.description,
    status: this.status,
    energyConsumed: this.energyConsumed,
    priority: this.priority,
    timestamp: this.timestamp,
    completedAt: this.completedAt,
    metadata: this.metadata
  };
};

// Static method to log activity
activityLogSchema.statics.logActivity = async function(data) {
  try {
    const log = await this.create({
      sourceAgent: data.sourceAgent,
      targetAgent: data.targetAgent || null,
      actionType: data.actionType,
      title: data.title,
      description: data.description || '',
      status: data.status || 'success',
      energyConsumed: data.energyConsumed || 0,
      priority: data.priority || 'medium',
      metadata: data.metadata || {},
      timestamp: data.timestamp || new Date(),
      completedAt: data.status === 'success' ? new Date() : null
    });
    
    console.log(`📝 [ACTIVITY LOG] ${log.logEntry}`);
    return log;
  } catch (error) {
    console.error('❌ [ACTIVITY LOG] Error logging activity:', error.message);
    return null;
  }
};

// Static method to get recent activities
activityLogSchema.statics.getRecentActivities = async function(limit = 50, filters = {}) {
  try {
    const query = {};
    
    if (filters.sourceAgent) query.sourceAgent = filters.sourceAgent;
    if (filters.targetAgent) query.targetAgent = filters.targetAgent;
    if (filters.actionType) query.actionType = filters.actionType;
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    
    const activities = await this.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    
    return activities;
  } catch (error) {
    console.error('❌ [ACTIVITY LOG] Error fetching activities:', error.message);
    return [];
  }
};

// Static method to get activity statistics
activityLogSchema.statics.getStatistics = async function(timeRange = 24) {
  try {
    const startTime = new Date(Date.now() - timeRange * 60 * 60 * 1000);
    
    const stats = await this.aggregate([
      { $match: { timestamp: { $gte: startTime } } },
      {
        $group: {
          _id: {
            sourceAgent: '$sourceAgent',
            status: '$status'
          },
          count: { $sum: 1 },
          totalEnergy: { $sum: '$energyConsumed' }
        }
      },
      {
        $group: {
          _id: '$_id.sourceAgent',
          activities: {
            $push: {
              status: '$_id.status',
              count: '$count',
              totalEnergy: '$totalEnergy'
            }
          },
          totalActivities: { $sum: '$count' },
          totalEnergyConsumed: { $sum: '$totalEnergy' }
        }
      }
    ]);
    
    return stats;
  } catch (error) {
    console.error('❌ [ACTIVITY LOG] Error getting statistics:', error.message);
    return [];
  }
};

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;
