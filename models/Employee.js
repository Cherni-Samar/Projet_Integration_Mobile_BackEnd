const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },

  email: { 
    type: String, 
    required: true, 
    lowercase: true, 
    trim: true 
  },

  // CEO propriétaire de cet employé
  ceo_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  role: { 
    type: String, 
    required: true, 
    trim: true 
  },

  department: { 
    type: String, 
    required: true, 
    trim: true 
  },

  contract: {
    type: { 
      type: String, 
      enum: ['CDI', 'CDD', 'Stage', 'Freelance']
    },
    start: Date,
    end: Date
  },

  manager_email: { 
    type: String, 
    trim: true 
  },

  password: {
    type: String,
    select: false,
    default: null
  },

  leave_balance: {
    annual: { type: Number, default: 25, min: 0 },
    sick: { type: Number, default: 10, min: 0 },
    urgent: { type: Number, default: 3, min: 0 }
  },

  leave_balance_used: {
    annual: { type: Number, default: 0, min: 0 },
    sick: { type: Number, default: 0, min: 0 },
    urgent: { type: Number, default: 0, min: 0 }
  },

  leave_balance_year: {
    type: Number,
    default: 2025
  },

  status: {
    type: String,
    enum: ['active', 'onboarding', 'offboarding', 'inactive'],
    default: 'active'
  },

  salary: { 
    type: Number, 
    select: false 
  },

  created_at: { 
    type: Date, 
    default: Date.now 
  },

  updated_at: { 
    type: Date, 
    default: Date.now 
  }
});

// Email unique seulement à l’intérieur du même CEO
employeeSchema.index(
  { ceo_id: 1, email: 1 },
  { unique: true }
);

employeeSchema.methods.getRemainingLeave = function(type) {
  const balance = this.leave_balance?.[type] || 0;
  const used = this.leave_balance_used?.[type] || 0;
  return Math.max(0, balance - used);
};

employeeSchema.methods.getAllRemainingLeaves = function() {
  return {
    annual: this.getRemainingLeave('annual'),
    sick: this.getRemainingLeave('sick'),
    urgent: this.getRemainingLeave('urgent')
  };
};

employeeSchema.methods.hasEnoughLeave = function(type, days) {
  return this.getRemainingLeave(type) >= days;
};

module.exports = mongoose.model('Employee', employeeSchema);