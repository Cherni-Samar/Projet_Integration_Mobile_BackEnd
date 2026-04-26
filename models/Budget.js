const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  category: {
    type: String,
    enum: ['SaaS', 'Marketing', 'Travel', 'Office', 'Salaries', 'Other'],
    required: true,
  },
  limit: {
    type: Number,
    required: true,
    min: 0,
  },
  spent: {
    type: Number,
    default: 0,
    min: 0,
  },
  currency: {
    type: String,
    default: 'TND',
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

// Index for querying budgets by manager and category
budgetSchema.index({ managerId: 1, category: 1 }, { unique: true });

// Update the updatedAt field before saving
budgetSchema.pre('save', async function() {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('Budget', budgetSchema);