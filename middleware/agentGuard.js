const User = require('../models/User');

/**
 * Validation function used to protect agent endpoints.
 *
 * @param {string} userId
 * @param {string} agentId
 * @returns {Promise<{ok: true, user: any}>}
 */
async function canUseAgent(userId, agentId) {
  if (!userId) {
    const err = new Error('Token manquant ou invalide');
    err.statusCode = 401;
    throw err;
  }

  if (!agentId) {
    const err = new Error('Agent invalide');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(userId).select('activeAgents energyBalance');

  if (!user) {
    const err = new Error('Utilisateur non trouvé');
    err.statusCode = 404;
    throw err;
  }

  const activeAgents = Array.isArray(user.activeAgents) ? user.activeAgents : [];

  if (!activeAgents.includes(agentId)) {
    const err = new Error(
      "Agent non recruté. Veuillez l'ajouter à votre abonnement."
    );
    err.statusCode = 403;
    throw err;
  }

  const energyBalance = typeof user.energyBalance === 'number' ? user.energyBalance : 0;

  if (energyBalance <= 0) {
    const err = new Error('Énergie épuisée. Veuillez recharger votre compte.');
    err.statusCode = 403;
    throw err;
  }

  return { ok: true, user };
}

/**
 * Express middleware wrapper around canUseAgent.
 *
 * @param {string|((req:any)=>string)} agentIdOrResolver
 */
function requireAgentAccess(agentIdOrResolver) {
  return async (req, res, next) => {
    try {
      const agentId =
        typeof agentIdOrResolver === 'function'
          ? agentIdOrResolver(req)
          : agentIdOrResolver;

      await canUseAgent(req.user?.id, agentId);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  canUseAgent,
  requireAgentAccess,
};
