const express = require('express');
const router = express.Router();

const employeeAuthController = require('../controllers/employeeAuthController');

// LOGIN
router.post('/login', employeeAuthController.login);
router.post('/change-password', require('../middleware/authEmployee'), require('../controllers/employeeAuthController').changePassword);module.exports = router;