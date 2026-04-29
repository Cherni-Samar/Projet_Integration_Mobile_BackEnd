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
        const { packId, suggestedAgents } = req.body; // Accept suggested agents from frontend

        // 1. Validation du pack
        const selectedPack = PAYMENTS_PACKS[packId];
        if (!selectedPack) {
            return res.status(400).json({
                success: false,
                message: 'Pack de paiement invalide',
            });
        }

        // 2. Validation des agents suggérés
        let validatedAgents = [];
        if (Array.isArray(suggestedAgents)) {
            const validAgentIds = ['hera', 'echo', 'timo', 'dexo', 'kash'];
            // Remove duplicates and filter only valid agent IDs
            validatedAgents = [...new Set(suggestedAgents.filter(agent => 
                typeof agent === 'string' && validAgentIds.includes(agent.toLowerCase())
            ))].map(agent => agent.toLowerCase());
        }

        console.log(`💡 Suggested agents validated: ${JSON.stringify(validatedAgents)}`);

        // 3. Création du PaymentIntent avec Métadonnées
        const paymentIntent = await stripe.paymentIntents.create({
            amount: selectedPack.amount, // Le serveur impose le prix
            currency: 'eur',
            automatic_payment_methods: { enabled: true },
            metadata: {
                userId: req.user.id || req.user.userId || req.user._id,
                packId: packId,
                creditsToAdd: selectedPack.credits.toString(),
                suggestedAgents: JSON.stringify(validatedAgents) // Store suggested agents
            },
        });

        console.log(`💳 PaymentIntent sécurisé créé: ${paymentIntent.id} pour ${selectedPack.name} avec agents: ${JSON.stringify(validatedAgents)}`);

        res.status(200).json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            details: selectedPack, // On renvoie les détails pour l'affichage Flutter
            suggestedAgents: validatedAgents // Return validated agents for frontend confirmation
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

const authUserId = req.user.id || req.user.userId || req.user._id;

if (authUserId && authUserId.toString() !== userId.toString()) {
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
                    activeAgents: alreadyProcessedUser.activeAgents,
                    warning: null,
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

            // Load user from database first
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            console.log("💳 Confirm payment for user:", userId);

            // Parse suggested agents from metadata
            const suggestedAgents = JSON.parse(paymentIntent.metadata.suggestedAgents || '[]');
            console.log(`🤖 Suggested agents from metadata: ${JSON.stringify(suggestedAgents)}`);

            // Get current user active agents
            const currentActiveAgents = user.activeAgents || [];
            console.log(`👤 Current active agents: ${JSON.stringify(currentActiveAgents)}`);

            // Determine plan limits
            let maxAgentsForPlan = 1; // default free
            if (packId === 'basic_plan') {
                maxAgentsForPlan = 3;
            } else if (packId === 'premium_plan') {
                maxAgentsForPlan = 5;
            }

            // Merge agents safely (avoid duplicates)
            const mergedAgents = [...new Set([...currentActiveAgents, ...suggestedAgents])];
            console.log(`🔄 Merged agents: ${JSON.stringify(mergedAgents)}`);

            // Enforce plan limit
            const allowedAgents = mergedAgents.slice(0, maxAgentsForPlan);
            const droppedAgents = mergedAgents.slice(maxAgentsForPlan);
            
            console.log(`✅ Allowed agents: ${JSON.stringify(allowedAgents)}`);
            console.log(`⚠️ Dropped agents: ${JSON.stringify(droppedAgents)}`);

            const update = {
                $inc: {
                    credits: creditsToAdd,
                    energyBalance: creditsToAdd,
                },
                $addToSet: {
                    processedPaymentIntents: paymentIntentId,
                },
                $set: {
                    activeAgents: allowedAgents // Set the allowed agents
                }
            };

            // If it's a subscription plan (not a topup), update plan and agent limit.
            if (!selectedPack.type) {
                if (packId === 'basic_plan') {
                    update.$set.subscriptionPlan = 'basic';
                    update.$set.maxAgentsAllowed = selectedPack.agentsAllowed ?? 3;
                } else if (packId === 'premium_plan') {
                    update.$set.subscriptionPlan = 'premium';
                    update.$set.maxAgentsAllowed = selectedPack.agentsAllowed ?? 5;
                }
            }

            // Mise à jour de l'utilisateur dans MongoDB
            const updatedUser = await User.findOneAndUpdate(
                { _id: userId, processedPaymentIntents: { $ne: paymentIntentId } },
                update,
{ returnDocument: 'after' }
            );

            if (!updatedUser) {
                // Extremely rare race: another request processed it between our check and update
                const freshUser = await User.findById(userId).lean();
                return res.status(200).json({
                    success: true,
                    message: 'Paiement déjà traité',
                    newBalance: freshUser?.credits,
                    activeAgents: freshUser?.activeAgents || [],
                    warning: null,
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

            // Prepare response data
            const responseData = {
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
            };

            // Add warning if some agents were dropped due to plan limits
            let warning = null;
            if (droppedAgents.length > 0) {
                warning = `Plan limit reached. ${droppedAgents.length} suggested agent(s) were not activated: ${droppedAgents.join(', ')}`;
            }

            console.log(`🎉 Payment confirmed successfully. Active agents: ${JSON.stringify(allowedAgents)}`);
            if (warning) {
                console.log(`⚠️ Warning: ${warning}`);
            }

            return res.status(200).json({
                success: true,
                message: "Paiement confirmé avec succès !",
                newBalance: updatedUser.credits,
                activeAgents: allowedAgents,
                warning: warning,
                data: responseData,
            });
        }

        res.status(400).json({ success: false, message: "Paiement non validé" });
    } catch (error) {
        console.error("❌ confirmPayment error:", error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};