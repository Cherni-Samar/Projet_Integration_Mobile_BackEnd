const mongoose = require('mongoose');

const heraActionSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  action_type: {
    type: String,
    enum: [
      'leave_approved', 'leave_refused', 'leave_urgent',
      'onboarding_started', 'onboarding_completed',
      'promotion', 'offboarding_started', 'offboarding_completed',
      'absence_alert', 'performance_alert',
      'contract_renewal', 'contract_end',
    ],
  },
  details:      { type: mongoose.Schema.Types.Mixed },
  triggered_by: {
    type: String,
    enum: ['auto', 'manager', 'employee', 'system'],
    default: 'auto',
  },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('HeraAction', heraActionSchema);