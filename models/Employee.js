const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  email:          { type: String, required: true, unique: true },
  role:           { type: String, required: true },
  department:     { type: String, required: true },
  contract: {
    type:  { type: String, enum: ['CDI', 'CDD', 'Stage'] },
    start: Date,
    end:   Date,
  },
  manager_email:  String,
  leave_balance:  { type: Number, default: 25 },
  status: {
    type: String,
    enum: ['active', 'offboarding', 'inactive'],
    default: 'active',
  },
  salary: { type: Number, select: false }, // 🔒 données sensibles
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Employee', employeeSchema);