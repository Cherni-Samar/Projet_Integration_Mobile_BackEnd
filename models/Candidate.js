const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  job_offer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'JobOffer' },
  status: { type: String, default: 'applied' },
  
  // ✅ C'EST ICI QUE LES FORMATIONS SONT STOCKÉES
  resume_text: { type: String }, 
  
  score_ia: { type: Number, default: 0 },
  meeting_link: { type: String },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Candidate', candidateSchema);