const mongoose = require('mongoose');
const heraActionSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  action_type: {
    type: String,
    enum: [
      'leave_approved','leave_pending',      // ✅ AJOUTE ICI
      'leave_refused', 'leave_urgent',
      'onboarding_started', 'onboarding_completed',
      // Employee lifecycle (newer, more explicit)
      'employee_onboarding_started',
      'employee_activated',
      'promotion', 'offboarding_started', 'offboarding_completed',
      'absence_alert', 'performance_alert',
      'contract_renewal', 'contract_end',
      'doc_request',
      'hiring_requested', 'budget_check', 'job_offer_approved', 'job_offer_posted',
    ],
  },
  details:      { type: mongoose.Schema.Types.Mixed },
  triggered_by: {
    type: String,
    enum: ['employee', 'manager', 'system', 'hera_auto'],
    default: 'auto',
  },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('HeraAction', heraActionSchema);