const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // La question
  question: { type: String, required: true },
  options: [{ type: String }],
  correctAnswer: { type: Number, required: true },
  challengeType: { type: String, enum: ['text', 'image'], default: 'text' },

  // L'agent choisi par le CEO
  chosenAgent: {
    type: String,
    enum: ['hera', 'echo', 'kash', 'dexo', 'timo'],
    default: null
  },

  // Réponse et résultat
  userAnswer: { type: Number, default: null },
  isCorrect: { type: Boolean, default: null },
  energyReward: { type: Number, default: 0 },

  // Domaine + badge
  domain: {
    type: String,
    enum: ['hera', 'kash', 'echo', 'dexo', 'timo'],
    required: true
  },
  badge: { name: String, emoji: String },

  // Streak tracking
  streakDay: { type: Number, default: 0 },

  status: { type: String, enum: ['pending', 'answered'], default: 'pending' },
  answeredAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

predictionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Prediction', predictionSchema);