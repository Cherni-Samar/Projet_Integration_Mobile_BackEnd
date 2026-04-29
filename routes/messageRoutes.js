const express = require('express');
const router = express.Router();

const optionalAuth = require('../middleware/optionalAuthMiddleware');
const messageController = require('../controllers/messageController');

router.use(optionalAuth);

// Routes
router.post('/echo', messageController.echo);
router.post('/process', messageController.processMessage);
router.post('/spam-check', messageController.spamCheck);
router.get('/stats', messageController.getStats);
router.get('/history/:userId?', messageController.getHistory);

module.exports = router;