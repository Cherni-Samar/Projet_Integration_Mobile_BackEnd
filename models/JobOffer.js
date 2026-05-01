const mongoose = require('mongoose');

const jobOfferSchema = new mongoose.Schema({
  title: { type: String, required: true },
  department: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['open', 'closed', 'pending'], default: 'open' },
  salary_range: { type: String },
  requested_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  budget_approved: { type: Boolean, default: false },
  budget_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Budget' },
  origin: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('JobOffer', jobOfferSchema);