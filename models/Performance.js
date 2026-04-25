const mongoose = require('mongoose');

const performanceSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  score:  { type: Number, min: 1, max: 10, required: true },
  period: { type: String, required: true },
  notes:  String,
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Performance', performanceSchema);