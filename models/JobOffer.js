const mongoose = require('mongoose');

const jobOfferSchema = new mongoose.Schema({
  /** `opening` = annonce ; `application` = formulaire candidature (sauvé dans joboffers) */
  document_type: { type: String, enum: ['opening', 'application'], default: 'opening' },
  title: { type: String, required: true },
  department: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['open', 'closed', 'pending_review'], default: 'open' },
  salary_range: { type: String },
  /** Rempli quand document_type === 'application' (formulaire /form) */
  candidate_name: { type: String },
  candidate_email: { type: String },
  resume_text: { type: String },
  related_job_offer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'JobOffer', default: null },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('JobOffer', jobOfferSchema, 'joboffers');