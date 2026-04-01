const express = require('express');
const router = express.Router();

const agentController = require('../controllers/agentController');
const authMiddleware = require('../middleware/authMiddleware');

// 🔹 Hire
router.post('/hire', authMiddleware, agentController.hireAgent);

// 🔹 HR
router.get('/hr', agentController.getHR);
router.post('/hr', agentController.postHR);

// 🔹 Echo
router.get('/echo', agentController.getEcho);
router.post('/echo', authMiddleware, agentController.postEcho);

// 🔹 Dexo
router.get('/dexo', agentController.getDexo);
router.post('/dexo', authMiddleware, agentController.postDexo);

module.exports = router;