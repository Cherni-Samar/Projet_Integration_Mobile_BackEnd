const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  job_offer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'JobOffer' },
  status: { 
    type: String, 
    enum: ['applied', 'interview_scheduled', 'hired', 'rejected'], 
    default: 'applied' 
  },
  resume_url: { type: String }, // Lien vers le CV
  interview_date: { type: Date },
  meeting_link: { type: String }, // Lien Google Meet / Teams généré par Hera
  score_ia: { type: Number, default: 0 }, // Score de matching CV/Offre
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Candidate', candidateSchema);