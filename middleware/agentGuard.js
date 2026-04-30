const User = require('../models/User');
const Employee = require('../models/Employee');

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
    const err = new Error("Agent non recruté. Veuillez l'ajouter à votre abonnement.");
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

async function canEmployeeUseAgent(employeeId, agentId) {
  if (!employeeId) {
    const err = new Error('employee_id manquant');
    err.statusCode = 400;
    throw err;
  }

  if (!agentId) {
    const err = new Error('Agent invalide');
    err.statusCode = 400;
    throw err;
  }

  const employee = await Employee.findById(employeeId);

  if (!employee) {
    const err = new Error('Employé non trouvé');
    err.statusCode = 404;
    throw err;
  }

  const ceoId = employee.ceo_id || employee.managerId || employee.user_id;

  if (!ceoId) {
    const err = new Error("CEO introuvable pour cet employé");
    err.statusCode = 404;
    throw err;
  }

  const ceo = await User.findById(ceoId).select('activeAgents energyBalance');

  if (!ceo) {
    const err = new Error('Utilisateur CEO non trouvé');
    err.statusCode = 404;
    throw err;
  }

  const activeAgents = Array.isArray(ceo.activeAgents) ? ceo.activeAgents : [];

  if (!activeAgents.includes(agentId)) {
    const err = new Error("Agent non recruté par le CEO.");
    err.statusCode = 403;
    throw err;
  }

  const energyBalance = typeof ceo.energyBalance === 'number' ? ceo.energyBalance : 0;

  if (energyBalance <= 0) {
    const err = new Error('Énergie épuisée. Veuillez recharger le compte CEO.');
    err.statusCode = 403;
    throw err;
  }

  return { ok: true, employee, ceo };
}

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

function requireEmployeeAgentAccess(agentIdOrResolver) {
  return async (req, res, next) => {
    try {
      const agentId =
        typeof agentIdOrResolver === 'function'
          ? agentIdOrResolver(req)
          : agentIdOrResolver;

      const employeeId =
        req.body.employee_id ||
        req.body.employeeId ||
        req.params.employee_id ||
        req.params.employeeId;

      const result = await canEmployeeUseAgent(employeeId, agentId);

      req.employee = result.employee;
      req.ceo = result.ceo;

      return next();
   } catch (err) {
  console.error('❌ Employee agent guard error:', err.message);

  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
  });
}
  };
}

module.exports = {
  canUseAgent,
  canEmployeeUseAgent,
  requireAgentAccess,
  requireEmployeeAgentAccess,
};