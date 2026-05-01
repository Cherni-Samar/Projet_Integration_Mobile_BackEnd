const express = require('express');
const router = express.Router();
const dexo = require('../controllers/dexoController');

router.get('/daily-checkup', dexo.getDailyCheckUp);
router.get('/document-actions', dexo.getDocumentActions);
router.post('/request-document', dexo.requestDocument);

module.exports = router;