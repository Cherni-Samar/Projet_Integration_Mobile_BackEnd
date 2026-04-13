const express = require('express');
const router = express.Router();
const timoController = require('../controllers/timoController');
const auth = require('../middleware/authMiddleware');

// ⏰ TIMO ROUTES — Agent de Planification
router.get('/inbox', auth, timoController.getTimoInbox);
router.get('/tasks', auth, timoController.getTimoTasks);
router.post('/confirm', auth, timoController.confirmPlanning);
router.post('/auto-plan', auth, timoController.autoPlanMeeting);

module.exports = router;
