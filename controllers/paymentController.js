const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');

// Définition des packs en dur sur le serveur (Sécurité maximale)
const PAYMENTS_PACKS = {
    free_trial: { amount: 0, credits: 50, agentsAllowed: 1, name: 'Free Trial' },
    basic_plan: { amount: 5900, credits: 250, agentsAllowed: 3, name: 'Basic Plan' },
    premium_plan: { amount: 9900, credits: 500, agentsAllowed: 5, name: 'Premium Plan' },
    energy_eco: { amount: 1000, credits: 100, type: 'topup', name: 'Pack Éco' },
    energy_boost: { amount: 3500, credits: 500, type: 'topup', name: 'Pack Boost' }
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
            const packId = paymentIntent.metadata.packId;

            if (req.user?.id && req.user.id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden',
                });
            }

            const selectedPack = PAYMENTS_PACKS[packId];
            if (!selectedPack) {
                return res.status(400).json({
                    success: false,
                    message: 'Pack de paiement invalide',
                });
            }

            const creditsToAdd = Number.parseInt(
                paymentIntent.metadata.creditsToAdd ?? `${selectedPack.credits}`,
                10,
            );

            // Idempotency: avoid crediting the same PaymentIntent twice
            const alreadyProcessedUser = await User.findOne({
                _id: userId,
                processedPaymentIntents: paymentIntentId,
            }).lean();
            if (alreadyProcessedUser) {
                return res.status(200).json({
                    success: true,
                    message: 'Paiement déjà traité',
                    newBalance: alreadyProcessedUser.credits,
                    data: {
                        user: {
                            id: alreadyProcessedUser._id,
                            email: alreadyProcessedUser.email,
                            name: alreadyProcessedUser.name,
                            isEmailVerified: alreadyProcessedUser.isEmailVerified,
                            subscriptionPlan: alreadyProcessedUser.subscriptionPlan,
                            maxAgentsAllowed: alreadyProcessedUser.maxAgentsAllowed,
                            activeAgents: alreadyProcessedUser.activeAgents,
                            energyBalance: alreadyProcessedUser.energyBalance,
                            credits: alreadyProcessedUser.credits,
                        },
                    },
                });
            }

            const update = {
                $inc: {
                    credits: creditsToAdd,
                    energyBalance: creditsToAdd,
                },
                $addToSet: {
                    processedPaymentIntents: paymentIntentId,
                },
            };

            // If it's a subscription plan (not a topup), update plan and agent limit.
            if (!selectedPack.type) {
                if (packId === 'basic_plan') {
                    update.$set = {
                        subscriptionPlan: 'basic',
                        maxAgentsAllowed: selectedPack.agentsAllowed ?? 3,
                    };
                } else if (packId === 'premium_plan') {
                    update.$set = {
                        subscriptionPlan: 'premium',
                        maxAgentsAllowed: selectedPack.agentsAllowed ?? 5,
                    };
                }
            }

            // Mise à jour de l'utilisateur dans MongoDB
            const updatedUser = await User.findOneAndUpdate(
                { _id: userId, processedPaymentIntents: { $ne: paymentIntentId } },
                update,
                { new: true }
            );

            if (!updatedUser) {
                // Extremely rare race: another request processed it between our check and update
                const freshUser = await User.findById(userId).lean();
                return res.status(200).json({
                    success: true,
                    message: 'Paiement déjà traité',
                    newBalance: freshUser?.credits,
                    data: {
                        user: freshUser
                            ? {
                                  id: freshUser._id,
                                  email: freshUser.email,
                                  name: freshUser.name,
                                  isEmailVerified: freshUser.isEmailVerified,
                                  subscriptionPlan: freshUser.subscriptionPlan,
                                  maxAgentsAllowed: freshUser.maxAgentsAllowed,
                                  activeAgents: freshUser.activeAgents,
                                  energyBalance: freshUser.energyBalance,
                                  credits: freshUser.credits,
                              }
                            : null,
                    },
                });
            }

            return res.status(200).json({
                success: true,
                message: "Paiement confirmé avec succès !",
                newBalance: updatedUser.credits,
                data: {
                    user: {
                        id: updatedUser._id,
                        email: updatedUser.email,
                        name: updatedUser.name,
                        isEmailVerified: updatedUser.isEmailVerified,
                        subscriptionPlan: updatedUser.subscriptionPlan,
                        maxAgentsAllowed: updatedUser.maxAgentsAllowed,
                        activeAgents: updatedUser.activeAgents,
                        energyBalance: updatedUser.energyBalance,
                        credits: updatedUser.credits,
                    },
                },
            });
        }

        res.status(400).json({ success: false, message: "Paiement non validé" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};