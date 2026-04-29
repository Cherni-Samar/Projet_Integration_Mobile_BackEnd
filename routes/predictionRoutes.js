const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/predictionController');
const authMiddleware = require('../middleware/authMiddleware');

// Toutes les routes nécessitent l'authentification (CEO connecté)
router.use(authMiddleware);

// Obtenir le défi du jour
router.get('/daily', predictionController.getDailyChallenges);

// Soumettre une réponse
router.post('/:id/answer', predictionController.submitAnswer);

// Historique et stats
router.get('/history', predictionController.getHistory);

// Reset le défi du jour (pour tester)
router.delete('/reset-today', async (req, res) => {
  try {
    const Prediction = require('../models/Prediction');
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const result = await Prediction.deleteMany({ userId: req.user.id, createdAt: { $gte: startOfDay } });
    res.json({ success: true, deleted: result.deletedCount, message: 'Défi du jour supprimé. Vous pouvez en générer un nouveau.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
