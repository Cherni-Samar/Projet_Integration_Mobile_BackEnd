const express = require('express');
const router = express.Router();
const { createPaymentIntent, confirmPayment } = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');

// POST /api/payment/create-payment-intent
router.post('/create-payment-intent', authMiddleware, createPaymentIntent);

// POST /api/payment/confirm-payment
router.post('/confirm-payment', authMiddleware, confirmPayment);

module.exports = router;
