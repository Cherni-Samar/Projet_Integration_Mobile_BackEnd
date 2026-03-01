const mongoose = require('mongoose');

const absenceSchema = new mongoose.Schema({
  employee_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  date:      { type: Date, required: true },
  reason:    String,
  justified: { type: Boolean, default: false },
  created_at:{ type: Date, default: Date.now },
});

module.exports = mongoose.model('Absence', absenceSchema);