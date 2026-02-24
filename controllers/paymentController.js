const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * @desc    Create a Stripe PaymentIntent
 * @route   POST /api/payment/create-payment-intent
 * @access  Private (requires auth token)
 */
exports.createPaymentIntent = async (req, res, next) => {
    try {
        const { amount, currency = 'eur' } = req.body;

        // Validate amount
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'A valid amount (in cents) is required',
            });
        }

        // Create payment intent with Stripe
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount), // amount in cents
            currency,
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                userId: req.user.id,
            },
        });

        console.log(`💳 PaymentIntent created: ${paymentIntent.id} for ${amount} ${currency}`);

        res.status(200).json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
        });
    } catch (error) {
        console.error('❌ Stripe error:', error.message);
        next(error);
    }
};
