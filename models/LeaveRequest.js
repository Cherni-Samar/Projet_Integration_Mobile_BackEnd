const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  type: {
    type: String,
    enum: ['annual', 'sick', 'urgent', 'unpaid'],
    required: true,
  },
  start_date:  { type: Date, required: true },
  end_date:    { type: Date, required: true },
  days:        { type: Number, required: true },
  reason:      String,
  status: {
    type: String,
    enum: ['pending', 'approved', 'refused'],
    default: 'pending',
  },
  approved_by: String,
  created_at:  { type: Date, default: Date.now },
});

module.exports = mongoose.model('LeaveRequest', leaveSchema);