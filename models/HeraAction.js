const mongoose = require('mongoose');

const heraActionSchema = new mongoose.Schema({
  // 🔥 PROPRIÉTAIRE (TRÈS IMPORTANT)
  ceo_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },

  action_type: {
    type: String,
    enum: [
      'leave_approved',
      'leave_pending',
      'leave_refused',
      'leave_urgent',
      'onboarding_started',
      'onboarding_completed',
      'employee_onboarding_started',
      'employee_activated',
      'promotion',
      'offboarding_started',
      'offboarding_completed',
      'absence_alert',
      'performance_alert',
      'contract_renewal',
      'contract_end',
      'doc_request',
    ],
  },

  details: { type: mongoose.Schema.Types.Mixed },

  triggered_by: {
    type: String,
    enum: ['employee', 'manager', 'system', 'hera_auto','kash_auto'],
    default: 'hera_auto', // ✅ corrige "auto"
  },

  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('HeraAction', heraActionSchema);