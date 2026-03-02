const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');

// Définition des packs en dur sur le serveur (Sécurité maximale)
const PAYMENTS_PACKS = {
    'starter_pack': { amount: 1000, credits: 100, name: 'Pack Découverte' },
    'pro_pack': { amount: 4500, credits: 500, name: 'Pack Professionnel' },
    'hiring_fee': { amount: 2000, credits: 0, name: 'Frais Engagement Agent' } // Pour le "Hiring system"
};

exports.createPaymentIntent = async (req, res, next) => {
    try {
        const { packId } = req.body; // L'app envoie l'ID du pack, pas le prix !

        // 1. Validation du pack
        const selectedPack = PAYMENTS_PACKS[packId];
        if (!selectedPack) {
            return res.status(400).json({
                success: false,
                message: 'Pack de paiement invalide',
            });
        }

        // 2. Création du PaymentIntent avec Métadonnées
        const paymentIntent = await stripe.paymentIntents.create({
            amount: selectedPack.amount, // Le serveur impose le prix
            currency: 'eur',
            automatic_payment_methods: { enabled: true },
            metadata: {
                userId: req.user.id, // ID de l'utilisateur qui paie
                packId: packId,
                creditsToAdd: selectedPack.credits.toString() 
            },
        });

        console.log(`💳 PaymentIntent sécurisé créé: ${paymentIntent.id} pour ${selectedPack.name}`);

        res.status(200).json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            details: selectedPack // On renvoie les détails pour l'affichage Flutter
        });
    } catch (error) {
        console.error('❌ Stripe error:', error.message);
        next(error);
    }
};

/**
 * @desc    Mise à jour des crédits après confirmation du paiement par Flutter
 * C'est ici qu'on satisfait la règle "Usage (Credits)" du tuteur
 */
exports.confirmPayment = async (req, res) => {
    try {
        const { paymentIntentId } = req.body;
        
        // On vérifie l'état réel du paiement chez Stripe (ne jamais faire confiance au front seul)
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === 'succeeded') {
            const userId = paymentIntent.metadata.userId;
            const credits = parseInt(paymentIntent.metadata.creditsToAdd);

            // Mise à jour de l'utilisateur dans MongoDB
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { $inc: { credits: credits } }, // Incrémente le solde
                { new: true }
            );

            return res.status(200).json({
                success: true,
                newBalance: updatedUser.credits,
                message: "Crédits ajoutés avec succès !"
            });
        }

        res.status(400).json({ success: false, message: "Paiement non validé" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};