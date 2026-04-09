const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  
  employee_email: {
    type: String,
    required: true,
    trim: true
  },
  
  type: {
    type: String,
    enum: ['annual', 'sick', 'urgent', 'unpaid'],
    required: true,
  },
  
  start_date: {
    type: Date,
    required: true
  },
  
  end_date: {
    type: Date,
    required: true
  },
  
  days: {
    type: Number,
    required: true,
    min: 1
  },
  
  reason: {
    type: String,
    trim: true
  },
  
  status: {
    type: String,
    enum: ['pending', 'approved', 'refused'],
    default: 'pending',
  },
  
  approved_by: {
    type: String,
    trim: true
  },
  
  approved_at: {
    type: Date
  },
  
  simultaneous_count: {
    type: Number,
    default: 0
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

// PAS DE HOOKS (évite les conflits)

module.exports = mongoose.model('LeaveRequest', leaveSchema);