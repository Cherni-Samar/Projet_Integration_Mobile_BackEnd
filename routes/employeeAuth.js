const express = require('express');
const router = express.Router();

const employeeAuthController = require('../controllers/employeeAuthController');

// LOGIN
router.post('/login', employeeAuthController.login);

module.exports = router;