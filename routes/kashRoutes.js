const express = require('express');
const router = express.Router();
const kash = require('../controllers/kashController');
const authMiddleware = require('../middleware/authMiddleware');

// POST /api/kash/add
router.post('/add', authMiddleware, kash.addExpense);

// POST /api/kash/analyze
router.post('/analyze', authMiddleware, kash.analyzeReceipt);

module.exports = router;
