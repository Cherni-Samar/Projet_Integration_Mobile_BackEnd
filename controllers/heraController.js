const Employee = require('../models/Employee');
const LeaveRequest = require('../models/LeaveRequest');
const HeraAction = require('../models/HeraAction');
const n8n = require('../services/n8n.service');
const bcrypt = require('bcryptjs');

// ══════════════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════════════

function validateDates(start_date, end_date) {
  const start = new Date(start_date);
  const end = new Date(end_date);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: 'Dates invalides (format incorrect)' };
  }
  if (end < start) {
    return { valid: false, error: 'La date de fin doit être après la date de début' };
  }
  return { valid: true, start, end };
}

function calculateDays(start, end) {
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

function checkMinimumNotice(start_date, type, minDays = 7) {
  if (type === 'urgent') return { valid: true };
  const today = new Date();
  const start = new Date(start_date);
  const daysUntilStart = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
  if (daysUntilStart < minDays) {
    return {
      valid: false,
      error: `Les congés normaux nécessitent ${minDays} jours de préavis minimum (${daysUntilStart} jour(s) donné(s))`
    };
  }
  return { valid: true };
}

// ══════════════════════════════════════════════════════════════════════════
// HELPER - Email de refus onboarding
// ══════════════════════════════════════════════════════════════════════════

async function sendOnboardingRefusalEmail(name, email, refusal_reason) {
  try {
    await n8n.onboarding({
      employee_name: name,
      employee_email: email,
      status: 'refused',
      refusal_reason
    });
    console.log(`📧 Email de refus envoyé à ${email} : ${refusal_reason}`);
  } catch (emailError) {
    console.error('⚠️ Erreur envoi email refus onboarding:', emailError.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ROUTES HANDLERS
// ══════════════════════════════════════════════════════════════════════════

// ── Hello ──────────────────────────────────────────────────────────────────
exports.hello = async (req, res) => {
  try {
    const { username } = req.body;
    const result = await n8n.hello({ username, intent: 'hello' });
    res.json(result || {
      success: true,
      agent: 'Hera',
      message: 'Hello! Je suis Hera, votre agent RH 👋',
      user: username,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Demande de congé ───────────────────────────────────────────────────────
exports.requestLeave = async (req, res) => {
  try {
    const { employee_id, employee_email, type, start_date, end_date, reason } = req.body;

    if (!employee_id || !employee_email || !type || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message: '❌ Champs requis : employee_id, employee_email, type, start_date, end_date'
      });
    }

    const validTypes = ['annual', 'sick', 'urgent'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_type',
        message: `❌ Type invalide. Types acceptés : ${validTypes.join(', ')}`
      });
    }

    const dateValidation = validateDates(start_date, end_date);
    if (!dateValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'invalid_dates',
        message: `❌ ${dateValidation.error}`
      });
    }

    const { start, end } = dateValidation;
    const days = calculateDays(start, end);

    if (days > 30) {
      return res.status(400).json({
        success: false,
        error: 'duration_exceeded',
        message: `❌ Maximum 30 jours consécutifs (${days} demandé(s))`
      });
    }

    const noticeCheck = checkMinimumNotice(start_date, type, 7);
    if (!noticeCheck.valid) {
      return res.status(400).json({
        success: false,
        error: 'insufficient_notice',
        message: `❌ ${noticeCheck.error}`
      });
    }

    const employee = await Employee.findById(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'employee_not_found',
        message: '❌ Employé non trouvé'
      });
    }

    const balance = employee.leave_balance?.[type] || 0;
    const used = employee.leave_balance_used?.[type] || 0;
    const remaining = balance - used;

    if (days > remaining) {
      try {
        await n8n.requestLeave({
          employee_name: employee.name,
          employee_email: employee.email,
          manager_email: employee.manager_email,
          type, start_date, end_date, days,
          reason: reason || 'Congé',
          status: 'refused',
          refusal_reason: `Solde insuffisant : ${remaining} jour(s) restant(s)`
        });
      } catch (emailError) {
        console.error('⚠️ Erreur envoi email refus:', emailError.message);
      }

      return res.status(400).json({
        success: false,
        error: 'insufficient_balance',
        status: 'refused',
        message: `❌ Solde insuffisant : ${remaining} jour(s) restant(s), ${days} demandé(s)`,
        balance_left: remaining,
        days_requested: days
      });
    }

    const ownConflicts = await LeaveRequest.find({
      employee_id,
      status: { $in: ['approved'] },
      $or: [{ start_date: { $lte: end }, end_date: { $gte: start } }]
    });

    if (ownConflicts.length > 0) {
      try {
        await n8n.requestLeave({
          employee_name: employee.name,
          employee_email: employee.email,
          manager_email: employee.manager_email,
          type, start_date, end_date, days,
          reason: reason || 'Congé',
          status: 'refused',
          refusal_reason: 'Conflit avec un congé existant'
        });
      } catch (emailError) {
        console.error('⚠️ Erreur envoi email refus:', emailError.message);
      }

      return res.status(409).json({
        success: false,
        error: 'date_conflict',
        status: 'refused',
        message: `❌ Vous avez déjà un congé prévu sur cette période`,
        conflicts: ownConflicts.map(c => ({
          start: c.start_date, end: c.end_date,
          type: c.type, status: c.status
        }))
      });
    }

    const simultaneousCount = await LeaveRequest.countDocuments({
      status: 'approved',
      employee_id: { $ne: employee_id },
      $or: [{ start_date: { $lte: end }, end_date: { $gte: start } }]
    });

    const MAX_SIMULTANEOUS = 2;
    console.log(`🤖 HERA DÉCISION : ${simultaneousCount} employés déjà en congé (max: ${MAX_SIMULTANEOUS})`);

    let status, approved_by, approved_at, auto_decision_reason;

    if (type === 'urgent') {
      status = 'approved';
      approved_by = 'Hera (auto - urgent)';
      approved_at = new Date();
      auto_decision_reason = 'Congé urgent approuvé automatiquement';
      console.log('✅ DÉCISION : APPROUVÉ (urgent)');

    } else if (simultaneousCount < MAX_SIMULTANEOUS) {
      status = 'approved';
      approved_by = 'Hera (auto - disponible)';
      approved_at = new Date();
      auto_decision_reason = `${simultaneousCount} employé(s) déjà en congé`;
      console.log('✅ DÉCISION : APPROUVÉ (capacité OK)');

    } else {
      status = 'refused';
      approved_by = 'Hera (auto - capacité max)';
      approved_at = new Date();
      auto_decision_reason = `${simultaneousCount} employés déjà en congé (max: ${MAX_SIMULTANEOUS})`;
      console.log('❌ DÉCISION : REFUSÉ (capacité max atteinte)');

      try {
        await n8n.requestLeave({
          employee_name: employee.name,
          employee_email: employee.email,
          manager_email: employee.manager_email,
          type, start_date, end_date, days,
          reason: reason || 'Congé',
          status: 'refused',
          refusal_reason: auto_decision_reason
        });
      } catch (emailError) {
        console.error('⚠️ Erreur envoi email refus:', emailError.message);
      }

      await HeraAction.create({
        employee_id,
        action_type: 'leave_refused',
        details: { type, days, reason, auto_decision_reason, simultaneous_count: simultaneousCount },
        triggered_by: 'hera_auto',
      });

      return res.status(409).json({
        success: false,
        error: 'max_simultaneous_reached',
        status: 'refused',
        message: `❌ ${auto_decision_reason}`,
        simultaneous_count: simultaneousCount,
        max_allowed: MAX_SIMULTANEOUS
      });
    }

    const leave = await LeaveRequest.create({
      employee_id, employee_email, type,
      start_date: start, end_date: end, days,
      reason: reason || 'Congé',
      status, simultaneous_count: simultaneousCount,
      approved_by, approved_at
    });

    console.log(`💾 Congé créé : ${leave._id} avec statut "${status}"`);

    if (status === 'approved') {
      await Employee.findByIdAndUpdate(employee_id, {
        $inc: { [`leave_balance_used.${type}`]: days }
      });
    }

    await HeraAction.create({
      employee_id,
      action_type: status === 'approved' ? 'leave_approved' : 'leave_refused',
      details: { leave_id: leave._id, type, days, reason, auto_decision_reason, simultaneous_count: simultaneousCount },
      triggered_by: 'hera_auto',
    });

    try {
      await n8n.requestLeave({
        employee_name: employee.name,
        employee_email: employee.email,
        manager_email: employee.manager_email,
        leave_id: leave._id.toString(),
        type, start_date, end_date, days,
        reason: leave.reason,
        status, auto_decision_reason,
        balance_left: remaining - days,
        simultaneous_count: simultaneousCount
      });
    } catch (emailError) {
      console.error('⚠️ Erreur envoi email:', emailError.message);
    }

    return res.status(201).json({
      success: true,
      status,
      message: `✅ Congé ${status === 'approved' ? 'approuvé' : 'refusé'} automatiquement par Hera`,
      leave_id: leave._id,
      start_date, end_date, days,
      balance_left: remaining - (status === 'approved' ? days : 0),
      simultaneous_count: simultaneousCount,
      auto_decision_reason
    });

  } catch (err) {
    console.error('❌ Erreur requestLeave:', err);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: '❌ Erreur serveur : ' + err.message
    });
  }
};

// ── Historique des congés ──────────────────────────────────────────────────
exports.getLeaveHistory = async (req, res) => {
  try {
    const requests = await LeaveRequest.find({ employee_id: req.params.employee_id })
      .sort({ created_at: -1 });
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Congé urgent ───────────────────────────────────────────────────────────
exports.urgentLeave = async (req, res) => {
  try {
    const { employee_id, employee_email, reason } = req.body;
    if (!employee_id || !employee_email) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message: '❌ employee_id et employee_email requis'
      });
    }
    const today = new Date().toISOString().split('T')[0];
    req.body = {
      employee_id, employee_email,
      type: 'urgent',
      start_date: today, end_date: today,
      reason: reason || 'Urgence'
    };
    return exports.requestLeave(req, res);
  } catch (err) {
    console.error('❌ Erreur urgentLeave:', err);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: '❌ Erreur serveur : ' + err.message
    });
  }
};

// ══════════════════════════════════════════════════════════════════════════
// 👤 ONBOARDING COMPLET
// ══════════════════════════════════════════════════════════════════════════

exports.onboarding = async (req, res) => {
  try {
    const {
      name, email, role, department,
      contract_type, contract_start,
      manager_email, salary
    } = req.body;

    // ── Champs obligatoires ───────────────────────────────────────────────
    if (!name || !email || !role || !contract_type) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message: '❌ name, email, role, contract_type requis'
      });
    }

    // ── Email déjà existant ───────────────────────────────────────────────
    const existingEmployee = await Employee.findOne({ email });
    if (existingEmployee) {
      await sendOnboardingRefusalEmail(
        name, email,
        `L'email ${email} est déjà associé à un compte existant.`
      );
      return res.status(409).json({
        success: false,
        error: 'email_exists',
        message: `❌ Un employé avec l'email ${email} existe déjà`
      });
    }

    // ── Limite par type de contrat ────────────────────────────────────────
    const CONTRACT_LIMITS = {
      Stage:     { max_simultaneous: 3,  max_per_year: 10  },
      Freelance: { max_simultaneous: 5,  max_per_year: 20  },
      CDD:       { max_simultaneous: 10, max_per_year: 30  },
      CDI:       { max_simultaneous: 50, max_per_year: 100 }
    };

    const currentContractCount = await Employee.countDocuments({
      'contract.type': contract_type,
      status: { $in: ['active', 'onboarding'] }
    });

    const contractLimit = CONTRACT_LIMITS[contract_type];
    if (contractLimit && currentContractCount >= contractLimit.max_simultaneous) {
      await sendOnboardingRefusalEmail(
        name, email,
        `Limite de contrats ${contract_type} atteinte : ${currentContractCount}/${contractLimit.max_simultaneous} actuellement.`
      );
      return res.status(400).json({
        success: false,
        error: 'contract_limit_reached',
        message: `❌ Limite atteinte : ${currentContractCount}/${contractLimit.max_simultaneous} ${contract_type} actuellement`
      });
    }

    // ── Limite par département ────────────────────────────────────────────
    if (department) {
      const DEPARTMENT_LIMITS = {
        Tech:       { max_employees: 5, max_interns: 2 },
        Design:     { max_employees: 5, max_interns: 1 },
        Marketing:  { max_employees: 10, max_interns: 2 },
        RH:         { max_employees: 5,  max_interns: 0 },
        Finance:    { max_employees: 8,  max_interns: 0 },
        Support:    { max_employees: 12, max_interns: 1 },
        Management: { max_employees: 10, max_interns: 0 }
      };

      const deptCount = await Employee.countDocuments({
        department,
        status: { $in: ['active', 'onboarding'] }
      });

      const deptLimit = DEPARTMENT_LIMITS[department];
      if (deptLimit && deptCount >= deptLimit.max_employees) {
        await sendOnboardingRefusalEmail(
          name, email,
          `Le département ${department} est complet : ${deptCount}/${deptLimit.max_employees} employés maximum.`
        );
        return res.status(400).json({
          success: false,
          error: 'department_limit_reached',
          message: `❌ Département ${department} complet : ${deptCount}/${deptLimit.max_employees} employés`
        });
      }

      if (contract_type === 'Stage' && deptLimit) {
        const internCount = await Employee.countDocuments({
          department,
          'contract.type': 'Stage',
          status: { $in: ['active', 'onboarding'] }
        });
        if (internCount >= deptLimit.max_interns) {
          await sendOnboardingRefusalEmail(
            name, email,
            `Le département ${department} ne peut pas accueillir plus de ${deptLimit.max_interns} stagiaire(s) (${internCount} actuellement).`
          );
          return res.status(400).json({
            success: false,
            error: 'intern_limit_reached',
            message: `❌ ${department} : ${internCount}/${deptLimit.max_interns} stagiaire(s) maximum`
          });
        }
      }
    }

    // ── Postes uniques ────────────────────────────────────────────────────
    const UNIQUE_ROLES = ['CEO', 'Directeur Général', 'CFO', 'CTO', 'DRH'];
    const isUniqueRole = UNIQUE_ROLES.some(ur => role.toLowerCase().includes(ur.toLowerCase()));
    if (isUniqueRole) {
      const existingRole = await Employee.findOne({
        role: new RegExp(role, 'i'),
        status: { $in: ['active', 'onboarding'] }
      });
      if (existingRole) {
        await sendOnboardingRefusalEmail(
          name, email,
          `Le poste "${role}" est déjà occupé. Ce poste est unique dans l'entreprise.`
        );
        return res.status(400).json({
          success: false,
          error: 'unique_role_taken',
          message: `❌ Le poste "${role}" est déjà occupé par ${existingRole.name}`
        });
      }
    }

    // ── Combinaisons interdites ───────────────────────────────────────────
    const FORBIDDEN_COMBINATIONS = {
      Stage:     ['Manager', 'CEO', 'Directeur', 'Team Lead', 'Chef', 'Responsable', 'Senior'],
      Freelance: ['CEO', 'Directeur Général', 'DRH', 'CFO', 'CTO']
    };
    const forbiddenRoles = FORBIDDEN_COMBINATIONS[contract_type];
    if (forbiddenRoles) {
      const isForbidden = forbiddenRoles.some(fr => role.toLowerCase().includes(fr.toLowerCase()));
      if (isForbidden) {
        await sendOnboardingRefusalEmail(
          name, email,
          `La combinaison contrat "${contract_type}" et poste "${role}" n'est pas autorisée.`
        );
        return res.status(400).json({
          success: false,
          error: 'invalid_role_contract_combination',
          message: `❌ Un ${contract_type} ne peut pas être "${role}"`
        });
      }
    }

    // ── Limite quotidienne ────────────────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const onboardingsToday = await Employee.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow }
    });
    if (onboardingsToday >= 5) {
      await sendOnboardingRefusalEmail(
        name, email,
        `La limite de ${onboardingsToday}/5 demandes d'embauche par jour est atteinte. Veuillez réessayer demain.`
      );
      return res.status(400).json({
        success: false,
        error: 'daily_limit_reached',
        message: `❌ Limite quotidienne atteinte : ${onboardingsToday}/5 onboardings aujourd'hui.`
      });
    }

    // ── Création employé ──────────────────────────────────────────────────
    console.log(`🤖 HERA ONBOARDING : Création de ${name} (${role})`);

    let leaveBalance, contractDuration;
    switch (contract_type) {
      case 'CDI':      leaveBalance = { annual: 25, sick: 10, urgent: 3 }; contractDuration = null; break;
      case 'CDD':      leaveBalance = { annual: 20, sick: 10, urgent: 2 }; contractDuration = 12;   break;
      case 'Stage':    leaveBalance = { annual: 5,  sick: 5,  urgent: 1 }; contractDuration = 6;    break;
      case 'Freelance':leaveBalance = { annual: 0,  sick: 0,  urgent: 0 }; contractDuration = 12;   break;
      default:         leaveBalance = { annual: 25, sick: 10, urgent: 3 }; contractDuration = null;
    }

    const startDate = contract_start ? new Date(contract_start) : new Date();
    const endDate = contractDuration
      ? new Date(startDate.getTime() + contractDuration * 30 * 24 * 60 * 60 * 1000)
      : null;

    const employee = await Employee.create({
      name, email, role,
      department: department || 'Non défini',
      contract: { type: contract_type, start: startDate, end: endDate },
      manager_email: manager_email || null,
      salary: salary || null,
      leave_balance: leaveBalance,
      leave_balance_used: { annual: 0, sick: 0, urgent: 0 },
      leave_balance_year: new Date().getFullYear(),
      status: 'onboarding'
    });

    console.log(`✅ Employé créé : ${employee._id}`);

    // ── Génération mot de passe temporaire ───────────────────────────────
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    employee.password = hashedPassword;
    await employee.save();
    console.log(`🔑 Mot de passe temporaire pour ${email} : ${tempPassword}`);

    // ── Log action ────────────────────────────────────────────────────────
    await HeraAction.create({
      employee_id: employee._id,
      action_type: 'onboarding_started',
      details: {
        name: employee.name,
        email: employee.email,
        role: employee.role,
        department: employee.department,
        contract_type,
        start_date: startDate,
        leave_balance: leaveBalance,
      },
      triggered_by: 'hera_auto',
    });

    // ── Envoi email de bienvenue avec mdp ─────────────────────────────────
    try {
      await n8n.onboarding({
        employee_name: name,
        employee_email: email,
        role,
        department: department || 'Non défini',
        start_date: startDate.toISOString().split('T')[0],
        contract_type,
        leave_balance: leaveBalance,
        temp_password: tempPassword,
        manager_email,
        status: 'approved'
      });
      console.log('✅ Email de bienvenue envoyé avec mot de passe temporaire');
    } catch (emailError) {
      console.error('⚠️ Erreur envoi email:', emailError.message);
    }

    return res.status(201).json({
      success: true,
      message: `✅ Onboarding démarré pour ${name}`,
      employee_id: employee._id,
      employee: {
        name: employee.name,
        email: employee.email,
        role: employee.role,
        department: employee.department,
        contract_type: employee.contract.type,
        start_date: employee.contract.start,
        end_date: employee.contract.end,
        status: employee.status
      },
      leave_balance: leaveBalance,
      emails_sent: {
        welcome_email: true,
        manager_notification: !!manager_email
      }
    });

  } catch (err) {
    console.error('❌ Erreur onboarding:', err);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: '❌ Erreur serveur : ' + err.message
    });
  }
};

// ── Récupérer les congés d'un employé ─────────────────────────────────────
exports.getLeaves = async (req, res) => {
  try {
    const { employee_id } = req.params;
    const leaves = await LeaveRequest.find({ employee_id })
      .sort({ created_at: -1 }).limit(50).lean();

    const employee = await Employee.findById(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'employee_not_found',
        message: '❌ Employé non trouvé'
      });
    }

    const calc = (type) => ({
      total: employee.leave_balance?.[type] || 0,
      used: employee.leave_balance_used?.[type] || 0,
      remaining: Math.max(0, (employee.leave_balance?.[type] || 0) - (employee.leave_balance_used?.[type] || 0))
    });

    return res.json({
      success: true,
      leaves,
      balances: { annual: calc('annual'), sick: calc('sick'), urgent: calc('urgent') },
      total_leaves: leaves.length
    });
  } catch (error) {
    console.error('❌ Erreur getLeaves:', error);
    return res.status(500).json({ success: false, error: 'server_error', message: error.message });
  }
};

// ── Promotion ──────────────────────────────────────────────────────────────
exports.promote = async (req, res) => {
  try {
    const { employee_id, new_role, new_salary } = req.body;
    const employee = await Employee.findById(employee_id);
    if (!employee) return res.status(404).json({ success: false, error: 'Employé non trouvé' });

    await Employee.findByIdAndUpdate(employee_id, { role: new_role, salary: new_salary });
    await HeraAction.create({
      employee_id, action_type: 'promotion',
      details: { old_role: employee.role, new_role },
      triggered_by: 'manager',
    });
    await n8n.promote({
      employee_name: employee.name,
      employee_email: employee.email,
      old_role: employee.role, new_role,
    });

    res.json({ success: true, message: `🎉 ${employee.name} promu(e) — ${new_role}` });
  } catch (err) {
    console.error('❌ Erreur promote:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Offboarding ────────────────────────────────────────────────────────────
exports.offboarding = async (req, res) => {
  try {
    const { employee_id, reason, last_day } = req.body;
    const employee = await Employee.findById(employee_id);
    if (!employee) return res.status(404).json({ success: false, error: 'Employé non trouvé' });

    await Employee.findByIdAndUpdate(employee_id, { status: 'offboarding' });
    await HeraAction.create({
      employee_id, action_type: 'offboarding_started',
      details: { reason, last_day }, triggered_by: 'system',
    });
    await n8n.offboarding({
      employee_name: employee.name,
      employee_email: employee.email,
      manager_email: employee.manager_email,
      reason, last_day,
    });

    res.json({ success: true, message: `🚪 Offboarding démarré pour ${employee.name}` });
  } catch (err) {
    console.error('❌ Erreur offboarding:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Historique actions ─────────────────────────────────────────────────────
exports.getHistory = async (req, res) => {
  try {
    const { employee_id } = req.params;
    const actions = await HeraAction.find({ employee_id })
      .sort({ created_at: -1 }).limit(20);
    res.json({ success: true, actions });
  } catch (err) {
    console.error('❌ Erreur getHistory:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN
// ══════════════════════════════════════════════════════════════════════════

exports.getAdminStats = async (req, res) => {
  try {
    const totalEmployees = await Employee.countDocuments({ status: 'active' });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const onLeaveToday = await LeaveRequest.countDocuments({
      status: 'approved',
      start_date: { $lte: tomorrow },
      end_date: { $gte: today }
    });

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const monthlyLeaves = await LeaveRequest.aggregate([
      { $match: { status: 'approved', start_date: { $gte: startOfMonth, $lte: endOfMonth } } },
      { $group: { _id: null, totalDays: { $sum: '$days' } } }
    ]);

    return res.json({
      success: true,
      stats: {
        total_employees: totalEmployees,
        on_leave_today: onLeaveToday,
        monthly_leave_days: monthlyLeaves[0]?.totalDays || 0
      }
    });
  } catch (error) {
    console.error('❌ Erreur getAdminStats:', error);
    return res.status(500).json({ success: false, error: 'server_error', message: error.message });
  }
};

exports.getAllEmployees = async (req, res) => {
  try {
    const employees = await Employee.find({ status: { $in: ['active', 'onboarding'] } })
      .select('-salary -__v').sort({ name: 1 }).lean();

    const employeesWithBalances = employees.map(emp => {
      const calc = (type) => ({
        total: emp.leave_balance?.[type] || 0,
        used: emp.leave_balance_used?.[type] || 0,
        remaining: Math.max(0, (emp.leave_balance?.[type] || 0) - (emp.leave_balance_used?.[type] || 0))
      });
      return {
        _id: emp._id.toString(),
        name: emp.name,
        email: emp.email,
        role: emp.role || 'Employé',
        department: emp.department || 'Non défini',
        status: emp.status || 'active',
        start_date: emp.contract?.start || null,
        balances: { annual: calc('annual'), sick: calc('sick'), urgent: calc('urgent') }
      };
    });

    return res.json({ success: true, employees: employeesWithBalances, total: employeesWithBalances.length });
  } catch (error) {
    console.error('❌ Erreur getAllEmployees:', error);
    return res.status(500).json({ success: false, error: 'server_error', message: error.message });
  }
};

exports.getRecentActions = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const recentLeaves = await LeaveRequest.find()
      .sort({ updated_at: -1, created_at: -1 }).limit(limit).lean();

    const enrichedLeaves = await Promise.all(
      recentLeaves.map(async (leave) => {
        const employee = await Employee.findById(leave.employee_id);
        return {
          _id: leave._id,
          employee_name: employee?.name || 'Unknown',
          employee_role: employee?.role || '',
          type: leave.type, status: leave.status,
          days: leave.days, start_date: leave.start_date,
          end_date: leave.end_date, approved_by: leave.approved_by,
          created_at: leave.created_at, updated_at: leave.updated_at,
        };
      })
    );

    return res.json({ success: true, recent_actions: enrichedLeaves, total: enrichedLeaves.length });
  } catch (error) {
    console.error('❌ Erreur getRecentActions:', error);
    return res.status(500).json({ success: false, error: 'server_error', message: error.message });
  }
};