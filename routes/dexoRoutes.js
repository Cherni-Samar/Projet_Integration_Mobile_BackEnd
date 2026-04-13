const express = require('express');
const router = express.Router();
const dexoController = require('../controllers/dexoController');
const auth = require('../middleware/authMiddleware');

// 🤖 DEXO ROUTES — Agent Exécutif
router.get('/daily-checkup', auth, dexoController.getDailyCheckUp);
router.post('/request-document', auth, dexoController.requestDocument);

module.exports = router;
