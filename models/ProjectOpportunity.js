const mongoose = require('mongoose');

const projectOpportunitySchema = new mongoose.Schema({
  title: String,
  clientEmail: String,
  description: String,
  estimatedBudget: Number,
  requiredEmployees: Number,
  durationMonths: Number,
  department: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  aiAnalysis: String, // Le petit résumé de Dexo
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ProjectOpportunity', projectOpportunitySchema);