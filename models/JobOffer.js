const mongoose = require('mongoose');

const jobOfferSchema = new mongoose.Schema({
  title: { type: String, required: true },
  department: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  salary_range: { type: String },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('JobOffer', jobOfferSchema);