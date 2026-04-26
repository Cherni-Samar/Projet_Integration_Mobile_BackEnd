const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');

// ================== Routes publiques ==================
router.post('/signup', authController.signup);
router.post('/login', authController.login);

// Routes vérification email
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerificationCode);

// Mot de passe oublié
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-reset-code', authController.verifyResetCode);
router.post('/reset-password', authController.resetPassword);

// ================== Routes protégées ==================
router.get('/me', authMiddleware, authController.getMe);
router.post('/logout', authMiddleware, authController.logout);

// ✅ Update profile (utilisateur normal)
router.patch('/update', authMiddleware, userController.updateUser);

module.exports = router;