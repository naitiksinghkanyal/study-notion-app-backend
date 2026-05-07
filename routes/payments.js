const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { createPaymentIntent, stripeWebhook, getPaymentHistory } = require('../controllers/paymentController');

// Webhook must receive raw body — set before express.json() in server.js
router.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
router.post('/create-intent', protect, createPaymentIntent);
router.get('/history', protect, getPaymentHistory);

module.exports = router;
