const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  assignee: {
    type: String,
    default: null,
    trim: true
  },
  deadline: {
    type: Date,
    default: null
  },
  category: {
    type: String,
    enum: ['meeting', 'development', 'communication', 'admin', 'research', 'other'],
    default: 'other'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'completed', 'cancelled'],
    default: 'todo'
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  },
  extractedFrom: {
    emailId: {
      type: String,
      default: null
    },
    sender: {
      type: String,
      default: null
    },
    subject: {
      type: String,
      default: null
    },
    extractedAt: {
      type: Date,
      default: Date.now
    }
  },
  userId: {
    type: String,
    required: true,
    default: 'current_user'
  },
  notes: {
    type: String,
    default: '',
    maxlength: 500
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient queries
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ userId: 1, category: 1 });
taskSchema.index({ userId: 1, priority: 1 });
taskSchema.index({ deadline: 1 });

// Virtual for overdue tasks
taskSchema.virtual('isOverdue').get(function() {
  return this.deadline && this.deadline < new Date() && this.status !== 'completed';
});

// Method to mark task as completed
taskSchema.methods.markCompleted = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

// Method to update status
taskSchema.methods.updateStatus = function(newStatus) {
  this.status = newStatus;
  if (newStatus === 'completed') {
    this.completedAt = new Date();
  } else if (this.completedAt) {
    this.completedAt = null;
  }
  return this.save();
};

// Static method to get tasks by user and status
taskSchema.statics.getByUserAndStatus = function(userId, status = null) {
  const query = { userId };
  if (status) {
    query.status = status;
  }
  return this.find(query).sort({ createdAt: -1 });
};

// Static method to get overdue tasks
taskSchema.statics.getOverdueTasks = function(userId) {
  return this.find({
    userId,
    deadline: { $lt: new Date() },
    status: { $ne: 'completed' }
  }).sort({ deadline: 1 });
};

module.exports = mongoose.model('Task', taskSchema);