const Employee = require('../models/Employee');
const LeaveRequest = require('../models/LeaveRequest');
const HeraAction = require('../models/HeraAction');
const User = require('../models/User');
const n8n = require('../services/n8n.service');

// ══════════════════════════════════════════════════════════════════════════
// UTILS - Fonctions de validation réutilisables
// ══════════════════════════════════════════════════════════════════════════

/**
 * Valide les dates (format et cohérence)
 */
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

/**
 * Calcule le nombre de jours entre 2 dates (inclusif)
 */
function calculateDays(start, end) {
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Vérifie le délai minimum (sauf pour congés urgents)
 */
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
// HERA ONBOARDING - Validations & helpers
// ══════════════════════════════════════════════════════════════════════════

const ALLOWED_CONTRACT_TYPES = ['CDI', 'CDD', 'Stage', 'Freelance'];

const DEPARTMENT_LIMITS = {
  Tech: { max_employees: 20, max_interns: 2 },
  Design: { max_employees: 10, max_interns: 1 },
  Marketing: { max_employees: 15, max_interns: 2 },
  RH: { max_employees: 5, max_interns: 0 },
  Finance: { max_employees: 8, max_interns: 0 },
  Support: { max_employees: 12, max_interns: 1 },
  Management: { max_employees: 10, max_interns: 0 },
};

const UNIQUE_ROLES = ['CEO', 'Directeur Général', 'CFO', 'CTO', 'DRH'];

const FORBIDDEN_ROLE_COMBINATIONS = {
  Stage: ['Manager', 'CEO', 'Directeur', 'Team Lead', 'Chef', 'Responsable', 'Senior'],
  Freelance: ['CEO', 'Directeur Général', 'DRH', 'CFO', 'CTO'],
};

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function addMonths(date, months) {
  const d = new Date(date);
  if (Number.isFinite(months) && months !== null) {
    d.setMonth(d.getMonth() + months);
  }
  return d;
}

function computeContractEnd(contractType, startDate) {
  // Default durations aligned with colleague implementation
  const durations = {
    CDI: null,
    CDD: 12,
    Stage: 6,
    Freelance: 12,
  };

  const months = Object.prototype.hasOwnProperty.call(durations, contractType)
    ? durations[contractType]
    : null;

  if (months === null) return null;
  return addMonths(startDate, months);
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

// ── Demande de congé (AUTO-DÉCISION HERA - 100% automatique) ───────────────
exports.requestLeave = async (req, res) => {
  try {
    const { employee_id, employee_email, type, start_date, end_date, reason } = req.body;

    // VALIDATION 1 : Champs requis
    if (!employee_id || !employee_email || !type || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message: '❌ Champs requis : employee_id, employee_email, type, start_date, end_date'
      });
    }

    // VALIDATION 2 : Type de congé valide
    const validTypes = ['annual', 'sick', 'urgent'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_type',
        message: `❌ Type invalide. Types acceptés : ${validTypes.join(', ')}`
      });
    }

    // VALIDATION 3 : Dates valides
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

    // VALIDATION 4 : Durée maximum
    const MAX_DAYS = 30;
    if (days > MAX_DAYS) {
      return res.status(400).json({
        success: false,
        error: 'duration_exceeded',
        message: `❌ Maximum ${MAX_DAYS} jours consécutifs (${days} demandé(s))`
      });
    }

    // VALIDATION 5 : Délai minimum
    const noticeCheck = checkMinimumNotice(start_date, type, 7);
    if (!noticeCheck.valid) {
      return res.status(400).json({
        success: false,
        error: 'insufficient_notice',
        message: `❌ ${noticeCheck.error}`
      });
    }

    // VALIDATION 6 : Employé existe
    const employee = await Employee.findById(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'employee_not_found',
        message: '❌ Employé non trouvé'
      });
    }

    // VALIDATION 7 : Solde suffisant
    const balance = employee.leave_balance?.[type] || 0;
    const used = employee.leave_balance_used?.[type] || 0;
    const remaining = balance - used;

    if (days > remaining) {
      try {
        await n8n.requestLeave({
          employee_name: employee.name,
          employee_email: employee.email,
          manager_email: employee.manager_email,
          type,
          start_date: start_date,
          end_date: end_date,
          days,
          reason: reason || 'Congé',
          status: 'refused',
          refusal_reason: `Solde insuffisant : ${remaining} jour(s) restant(s)`
        });
      } catch (emailError) {
        console.error('⚠️  Erreur envoi email refus:', emailError.message);
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

    // VALIDATION 8 : Pas de chevauchement
    const ownConflicts = await LeaveRequest.find({
      employee_id,
      status: { $in: ['approved'] },
      $or: [
        {
          start_date: { $lte: end },
          end_date: { $gte: start }
        }
      ]
    });

    if (ownConflicts.length > 0) {
      try {
        await n8n.requestLeave({
          employee_name: employee.name,
          employee_email: employee.email,
          manager_email: employee.manager_email,
          type,
          start_date: start_date,
          end_date: end_date,
          days,
          reason: reason || 'Congé',
          status: 'refused',
          refusal_reason: 'Conflit avec un congé existant'
        });
      } catch (emailError) {
        console.error('⚠️  Erreur envoi email refus:', emailError.message);
      }

      return res.status(409).json({
        success: false,
        error: 'date_conflict',
        status: 'refused',
        message: `❌ Vous avez déjà un congé prévu sur cette période`,
        conflicts: ownConflicts.map(c => ({
          start: c.start_date,
          end: c.end_date,
          type: c.type,
          status: c.status
        }))
      });
    }

    // VALIDATION 9 : Limite d'employés simultanés
    const simultaneousCount = await LeaveRequest.countDocuments({
      status: 'approved',
      employee_id: { $ne: employee_id },
      $or: [
        {
          start_date: { $lte: end },
          end_date: { $gte: start }
        }
      ]
    });

    const MAX_SIMULTANEOUS = 2;

    console.log(`🤖 HERA DÉCISION : ${simultaneousCount} employés déjà en congé (max: ${MAX_SIMULTANEOUS})`);

    // ═══════════════════════════════════════════════════════════════════════
    // 🎯 LOGIQUE AUTO-DÉCISION HERA (Plus de "pending" !)
    // ═══════════════════════════════════════════════════════════════════════
    let status;
    let approved_by;
    let approved_at;
    let auto_decision_reason;

    if (type === 'urgent') {
      // ✅ Urgent = TOUJOURS approuvé
      status = 'approved';
      approved_by = 'Hera (auto - urgent)';
      approved_at = new Date();
      auto_decision_reason = 'Congé urgent approuvé automatiquement';
      console.log('✅ DÉCISION : APPROUVÉ (urgent)');
      
    } else if (simultaneousCount < MAX_SIMULTANEOUS) {
      // ✅ < 2 personnes = APPROUVÉ
      status = 'approved';
      approved_by = 'Hera (auto - disponible)';
      approved_at = new Date();
      auto_decision_reason = `${simultaneousCount} employé(s) déjà en congé`;
      console.log('✅ DÉCISION : APPROUVÉ (capacité OK)');
      
    } else {
      // ❌ >= 2 personnes = REFUSÉ
      status = 'refused';
      approved_by = 'Hera (auto - capacité max)';
      approved_at = new Date();
      auto_decision_reason = `${simultaneousCount} employés déjà en congé (max: ${MAX_SIMULTANEOUS})`;
      console.log('❌ DÉCISION : REFUSÉ (capacité max atteinte)');
      
      // Email de refus
      try {
        await n8n.requestLeave({
          employee_name: employee.name,
          employee_email: employee.email,
          manager_email: employee.manager_email,
          type,
          start_date: start_date,
          end_date: end_date,
          days,
          reason: reason || 'Congé',
          status: 'refused',
          refusal_reason: auto_decision_reason
        });
      } catch (emailError) {
        console.error('⚠️  Erreur envoi email refus:', emailError.message);
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

    // ── Consommation d'énergie (demande de congé) ─────────────────────────
    // Coût: 5 énergie. On débite l'utilisateur authentifié si présent,
    // sinon fallback sur le manager_email de l'employé.
    const ENERGY_COST = 5;
    const managerEmail = normalizeEmail(employee.manager_email);

    const chargeFilter = req.user?.id
      ? { _id: req.user.id }
      : managerEmail
        ? { email: managerEmail }
        : null;

    let chargedUser = null;
    if (chargeFilter) {
      chargedUser = await User.findOneAndUpdate(
        { ...chargeFilter, energyBalance: { $gte: ENERGY_COST } },
        { $inc: { energyBalance: -ENERGY_COST } },
        { new: true }
      );

      if (!chargedUser) {
        return res.status(403).json({
          success: false,
          error: 'insufficient_energy',
          message: `❌ Énergie insuffisante. Cette action coûte ${ENERGY_COST} unités.`
        });
      }
    }

    // Crée la demande avec le statut décidé par Hera
    let leave;
    try {
      leave = await LeaveRequest.create({
        employee_id,
        employee_email,
        type,
        start_date: start,
        end_date: end,
        days,
        reason: reason || 'Congé',
        status,  // ✅ approved ou refused, JAMAIS pending
        simultaneous_count: simultaneousCount,
        approved_by,
        approved_at
      });
    } catch (createErr) {
      if (chargedUser?._id) {
        await User.findByIdAndUpdate(chargedUser._id, {
          $inc: { energyBalance: ENERGY_COST }
        });
      }
      throw createErr;
    }

    console.log(`💾 Congé créé : ${leave._id} avec statut "${status}"`);

    // Mise à jour du solde si approuvé
    if (status === 'approved') {
      await Employee.findByIdAndUpdate(employee_id, {
        $inc: { [`leave_balance_used.${type}`]: days }
      });
    }

    // Log action
    await HeraAction.create({
      employee_id,
      action_type: status === 'approved' ? 'leave_approved' : 'leave_refused',
      details: { leave_id: leave._id, type, days, reason, auto_decision_reason, simultaneous_count: simultaneousCount },
      triggered_by: 'hera_auto',
    });

    // Email d'approbation
    try {
      await n8n.requestLeave({
        employee_name: employee.name,
        employee_email: employee.email,
        manager_email: employee.manager_email,
        leave_id: leave._id.toString(),
        type,
        start_date: start_date,
        end_date: end_date,
        days,
        reason: leave.reason,
        status,
        auto_decision_reason,
        balance_left: remaining - days,
        simultaneous_count: simultaneousCount
      });
    } catch (emailError) {
      console.error('⚠️  Erreur envoi email:', emailError.message);
    }

    return res.status(201).json({
      success: true,
      status,
      message: `✅ Congé ${status === 'approved' ? 'approuvé' : 'refusé'} automatiquement par Hera`,
      leave_id: leave._id,
      start_date,
      end_date,
      days,
      balance_left: remaining - (status === 'approved' ? days : 0),
      simultaneous_count: simultaneousCount,
      auto_decision_reason,
      energyBalance: chargedUser?.energyBalance
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
      employee_id,
      employee_email,
      type: 'urgent',
      start_date: today,
      end_date: today,
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

// ── Onboarding ─────────────────────────────────────────────────────────────
exports.onboarding = async (req, res) => {
  try {
    const {
      name,
      email,
      role,
      department,
      contract_type,
      contract_start,
      manager_email,
      salary,
    } = req.body;

    // VALIDATION 1 : Champs requis
    if (!name || !email || !role || !contract_type) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message: '❌ name, email, role, contract_type requis'
      });
    }

    // VALIDATION 2 : Type de contrat
    if (!ALLOWED_CONTRACT_TYPES.includes(contract_type)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_contract_type',
        message: `❌ contract_type invalide. Types acceptés : ${ALLOWED_CONTRACT_TYPES.join(', ')}`,
      });
    }

    const normalizedEmail = normalizeEmail(email);

    // VALIDATION 3 : Email unique
    const existingEmployee = await Employee.findOne({ email: normalizedEmail }).lean();
    if (existingEmployee) {
      return res.status(409).json({
        success: false,
        error: 'email_exists',
        message: `❌ Un employé avec l'email ${normalizedEmail} existe déjà`,
      });
    }

    // VALIDATION 4 : Limites par département (si renseigné)
    const normalizedDepartment = typeof department === 'string' && department.trim() ? department.trim() : null;
    if (normalizedDepartment) {
      const deptLimit = DEPARTMENT_LIMITS[normalizedDepartment];
      if (deptLimit) {
        const deptCount = await Employee.countDocuments({
          department: normalizedDepartment,
          status: { $in: ['active', 'onboarding'] },
        });

        if (deptCount >= deptLimit.max_employees) {
          return res.status(400).json({
            success: false,
            error: 'department_limit_reached',
            message: `❌ Département ${normalizedDepartment} complet : ${deptCount}/${deptLimit.max_employees} employés`,
          });
        }

        // Limite de stagiaires par département
        if (contract_type === 'Stage') {
          const internCount = await Employee.countDocuments({
            department: normalizedDepartment,
            'contract.type': 'Stage',
            status: { $in: ['active', 'onboarding'] },
          });

          if (internCount >= deptLimit.max_interns) {
            return res.status(400).json({
              success: false,
              error: 'intern_limit_reached',
              message: `❌ ${normalizedDepartment} : ${internCount}/${deptLimit.max_interns} stagiaire(s) maximum`,
            });
          }
        }
      }
    }

    // VALIDATION 5 : Rôles autorisés (règles métier)
    // 5a) Postes uniques
    const roleText = typeof role === 'string' ? role.trim() : '';
    const isUniqueRole = UNIQUE_ROLES.some((uniqueRole) =>
      roleText.toLowerCase().includes(uniqueRole.toLowerCase())
    );

    if (isUniqueRole) {
      const existingRole = await Employee.findOne({
        role: new RegExp(roleText, 'i'),
        status: { $in: ['active', 'onboarding'] },
      }).lean();

      if (existingRole) {
        return res.status(400).json({
          success: false,
          error: 'unique_role_taken',
          message: `❌ Le poste "${roleText}" est déjà occupé par ${existingRole.name}`,
        });
      }
    }

    // 5b) Cohérence poste / contrat
    const forbidden = FORBIDDEN_ROLE_COMBINATIONS[contract_type];
    if (Array.isArray(forbidden) && forbidden.length > 0) {
      const isForbidden = forbidden.some((forbiddenRole) =>
        roleText.toLowerCase().includes(forbiddenRole.toLowerCase())
      );

      if (isForbidden) {
        return res.status(400).json({
          success: false,
          error: 'invalid_role_contract_combination',
          message: `❌ Un ${contract_type} ne peut pas être "${roleText}"`,
        });
      }
    }

    let leaveBalance;
    switch (contract_type) {
      case 'CDI':
        leaveBalance = { annual: 25, sick: 10, urgent: 3 };
        break;
      case 'CDD':
        leaveBalance = { annual: 20, sick: 10, urgent: 2 };
        break;
      case 'Stage':
        leaveBalance = { annual: 5, sick: 5, urgent: 1 };
        break;
      case 'Freelance':
        leaveBalance = { annual: 0, sick: 0, urgent: 0 };
        break;
      default:
        leaveBalance = { annual: 25, sick: 10, urgent: 3 };
    }

    const startDate = contract_start ? new Date(contract_start) : new Date();
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'invalid_contract_start',
        message: '❌ contract_start invalide (format incorrect)',
      });
    }

    const endDate = computeContractEnd(contract_type, startDate);
    const salaryValue = parseOptionalNumber(salary);

    const employee = await Employee.create({
      name,
      email: normalizedEmail,
      role: roleText,
      department: normalizedDepartment || 'Non défini',
      contract: { 
        type: contract_type, 
        start: startDate,
        end: endDate,
      },
      manager_email: manager_email || null,
      salary: salaryValue,
      leave_balance: leaveBalance,
      leave_balance_used: {
        annual: 0,
        sick: 0,
        urgent: 0
      },
      leave_balance_year: new Date().getFullYear(),
      status: 'onboarding'
    });

    await HeraAction.create({
      employee_id: employee._id,
      action_type: 'employee_onboarding_started',
      details: {
        name: employee.name,
        email: employee.email,
        role: employee.role,
        department: employee.department,
        contract_type: employee.contract?.type,
        start_date: employee.contract?.start,
        end_date: employee.contract?.end,
        status: employee.status,
        salary: salaryValue,
      },
      triggered_by: 'hera_auto',
    });

    res.status(201).json({
      success: true,
      message: `✅ Onboarding démarré pour ${name}`,
      employee_id: employee._id,
      employee: {
        name: employee.name,
        email: employee.email,
        role: employee.role,
        department: employee.department,
        contract_type: employee.contract?.type,
        start_date: employee.contract?.start,
        end_date: employee.contract?.end,
        status: employee.status,
      },
    });
  } catch (err) {
    console.error('❌ Erreur onboarding:', err);
    res.status(500).json({
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
    
    console.log(`📡 Récupération des congés pour l'employé ${employee_id}`);
    
    const leaves = await LeaveRequest.find({ employee_id })
      .sort({ created_at: -1 })
      .limit(50)
      .lean();
    
    console.log(`✅ ${leaves.length} congé(s) trouvé(s)`);
    
    const employee = await Employee.findById(employee_id);
    
    if (!employee) {
      console.log(`❌ Employé ${employee_id} non trouvé`);
      return res.status(404).json({
        success: false,
        error: 'employee_not_found',
        message: '❌ Employé non trouvé'
      });
    }
    
    // Calcul des soldes
    const annualTotal = employee.leave_balance?.annual || 0;
    const annualUsed = employee.leave_balance_used?.annual || 0;
    const annualRemaining = Math.max(0, annualTotal - annualUsed);
    
    const sickTotal = employee.leave_balance?.sick || 0;
    const sickUsed = employee.leave_balance_used?.sick || 0;
    const sickRemaining = Math.max(0, sickTotal - sickUsed);
    
    const urgentTotal = employee.leave_balance?.urgent || 0;
    const urgentUsed = employee.leave_balance_used?.urgent || 0;
    const urgentRemaining = Math.max(0, urgentTotal - urgentUsed);
    
    return res.json({
      success: true,
      leaves,
      balances: {
        annual: {
          total: annualTotal,
          used: annualUsed,
          remaining: annualRemaining
        },
        sick: {
          total: sickTotal,
          used: sickUsed,
          remaining: sickRemaining
        },
        urgent: {
          total: urgentTotal,
          used: urgentUsed,
          remaining: urgentRemaining
        }
      },
      total_leaves: leaves.length
    });
    
  } catch (error) {
    console.error('❌ Erreur getLeaves:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: '❌ Erreur serveur : ' + error.message
    });
  }
};

// Alias rétro-compat : certains clients utilisent encore /leave-history
exports.getLeaveHistory = exports.getLeaves;

// ── Promotion ──────────────────────────────────────────────────────────────
exports.promote = async (req, res) => {
  try {
    const { employee_id, new_role, new_salary } = req.body;

    const employee = await Employee.findById(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employé non trouvé'
      });
    }

    await Employee.findByIdAndUpdate(employee_id, {
      role: new_role,
      salary: new_salary,
    });

    await HeraAction.create({
      employee_id,
      action_type: 'promotion',
      details: { old_role: employee.role, new_role },
      triggered_by: 'manager',
    });

    await n8n.promote({
      employee_name: employee.name,
      employee_email: employee.email,
      old_role: employee.role,
      new_role,
    });

    res.json({
      success: true,
      message: `🎉 ${employee.name} promu(e) — ${new_role}`,
    });
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
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employé non trouvé'
      });
    }

    await Employee.findByIdAndUpdate(employee_id, {
      status: 'offboarding',
    });

    await HeraAction.create({
      employee_id,
      action_type: 'offboarding_started',
      details: { reason, last_day },
      triggered_by: 'system',
    });

    await n8n.offboarding({
      employee_name: employee.name,
      employee_email: employee.email,
      manager_email: employee.manager_email,
      reason,
      last_day,
    });

    res.json({
      success: true,
      message: `🚪 Offboarding démarré pour ${employee.name}`,
    });
  } catch (err) {
    console.error('❌ Erreur offboarding:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Historique ─────────────────────────────────────────────────────────────
exports.getHistory = async (req, res) => {
  try {
    const { employee_id } = req.params;
    const actions = await HeraAction
      .find({ employee_id })
      .sort({ created_at: -1 })
      .limit(20);

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
    const totalEmployees = await Employee.countDocuments({
      status: { $in: ['active', 'onboarding'] },
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const onLeaveToday = await LeaveRequest.countDocuments({
      status: 'approved',
      start_date: { $lte: tomorrow },
      end_date: { $gte: today }
    });
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    const monthlyLeaves = await LeaveRequest.aggregate([
      {
        $match: {
          status: 'approved',
          start_date: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalDays: { $sum: '$days' }
        }
      }
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
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

exports.getAllEmployees = async (req, res) => {
  try {
    console.log('📡 Récupération des employés...');
    
    const employees = await Employee.find({ status: { $in: ['active', 'onboarding'] } })
      .select('-salary -__v')
      .sort({ name: 1 })
      .lean();
    
    console.log(`✅ ${employees.length} employés trouvés`);
    
    const employeesWithBalances = employees.map(emp => {
      const annualTotal = emp.leave_balance?.annual || 0;
      const annualUsed = emp.leave_balance_used?.annual || 0;
      const annualRemaining = Math.max(0, annualTotal - annualUsed);
      
      const sickTotal = emp.leave_balance?.sick || 0;
      const sickUsed = emp.leave_balance_used?.sick || 0;
      const sickRemaining = Math.max(0, sickTotal - sickUsed);
      
      const urgentTotal = emp.leave_balance?.urgent || 0;
      const urgentUsed = emp.leave_balance_used?.urgent || 0;
      const urgentRemaining = Math.max(0, urgentTotal - urgentUsed);
      
      return {
        _id: emp._id.toString(),
        name: emp.name,
        email: emp.email,
        role: emp.role || 'Employé',
        department: emp.department || 'Non défini',
        status: emp.status || 'active',
        start_date: emp.contract?.start || null,
        balances: {
          annual: {
            total: annualTotal,
            used: annualUsed,
            remaining: annualRemaining
          },
          sick: {
            total: sickTotal,
            used: sickUsed,
            remaining: sickRemaining
          },
          urgent: {
            total: urgentTotal,
            used: urgentUsed,
            remaining: urgentRemaining
          }
        }
      };
    });
    
    console.log('📤 Envoi des employés:', JSON.stringify(employeesWithBalances, null, 2));
    
    return res.json({
      success: true,
      employees: employeesWithBalances,
      total: employeesWithBalances.length
    });
    
  } catch (error) {
    console.error('❌ Erreur getAllEmployees:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};
/**
 * Récupère les actions récentes (historique)
 */
exports.getRecentActions = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    // Récupère les dernières demandes de congé (tous statuts)
    const recentLeaves = await LeaveRequest.find()
      .sort({ updated_at: -1, created_at: -1 })
      .limit(limit)
      .lean();
    
    // Enrichir avec les noms d'employés
    const enrichedLeaves = await Promise.all(
      recentLeaves.map(async (leave) => {
        const employee = await Employee.findById(leave.employee_id);
        return {
          _id: leave._id,
          employee_name: employee?.name || 'Unknown',
          employee_role: employee?.role || '',
          type: leave.type,
          status: leave.status,
          days: leave.days,
          start_date: leave.start_date,
          end_date: leave.end_date,
          approved_by: leave.approved_by,
          created_at: leave.created_at,
          updated_at: leave.updated_at,
        };
      })
    );
    
    return res.json({
      success: true,
      recent_actions: enrichedLeaves,
      total: enrichedLeaves.length
    });
    
  } catch (error) {
    console.error('❌ Erreur getRecentActions:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message
    });
  }
};

/**
 * Admin: récupère toutes les actions (HeraAction)
 */
exports.getAllActions = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const actions = await HeraAction.find()
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, actions, total: actions.length });
  } catch (error) {
    console.error('❌ Erreur getAllActions:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: error.message,
    });
  }
};

/**
 * Admin: supprime une action (HeraAction)
 */
exports.deleteAction = async (req, res) => {
  try {
    const { action_id } = req.params;

    if (!action_id) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message: '❌ action_id requis',
      });
    }

    const deleted = await HeraAction.findByIdAndDelete(action_id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: '❌ Action introuvable',
      });
    }

    return res.json({ success: true, message: '🗑️ Action supprimée', action_id });
  } catch (error) {
    // CastError si action_id invalide
    const status = error?.name === 'CastError' ? 400 : 500;
    console.error('❌ Erreur deleteAction:', error);
    return res.status(status).json({
      success: false,
      error: status === 400 ? 'invalid_id' : 'server_error',
      message: error.message,
    });
  }
};

exports.requestLeave = async (req, res, next) => {
  console.log('📦 BODY =>', JSON.stringify(req.body, null, 2));

try {
const Employee = require('../models/Employee');

// ✅ Lire directement depuis req.body
const employee_name = req.body?.employee_name;
const type = req.body?.type;
const start_date = req.body?.start_date;
const end_date = req.body?.end_date;
const reason = req.body?.reason;

console.log('📞 ARGS =>', { employee_name, type, start_date, end_date, reason });

if (!employee_name || !type || !start_date || !end_date) {
return res.status(400).json({
success: false,
error: 'missing_fields',
message: '❌ Champs requis manquants',
});
}

let employee = await Employee.findOne({ name: employee_name });
if (!employee) {
employee = await Employee.findOne({
name: { $regex: `^${employee_name}$`, $options: 'i' },
});
}

if (!employee) {
return res.status(404).json({
success: false,
error: 'employee_not_found',
message: `❌ Employé introuvable : ${employee_name}`,
});
}

req.body = {
employee_id: employee._id.toString(),
employee_email: employee.email,
type,
start_date,
end_date,
reason: reason || 'Congé demandé via Hera Voice',
};

console.log('✅ BODY ENVOYÉ À HERA =>', req.body);
return hera.requestLeave(req, res, next);

} catch (error) {
console.error('❌ Erreur:', error);
return res.status(500).json({
success: false,
error: 'server_error',
message: '❌ Erreur serveur : ' + error.message,
});
}
};
// ══════════════════════════════════════════════════════════════════════════
// NOUVELLE ROUTE : Envoyer un email à Echo
// ══════════════════════════════════════════════════════════════════════════

exports.sendEmailToEcho = async (req, res) => {
  const { to, subject, content, from } = req.body;
 
  try {
    const response = await fetch('http://localhost:3000/api/emails/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: subject,
        sender: from || 'hera@e-team.com',
        content: content
      })
    });
   
    const analysis = await response.json();
   
    res.json({
      success: true,
      message: 'Email envoyé à Echo',
      analysis: analysis
    });
   
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
// ══════════════════════════════════════════════════════════════════════════
// RECEVOIR UN EMAIL D'ECHO
// ══════════════════════════════════════════════════════════════════════════

exports.receiveEmailFromEcho = async (req, res) => {
  const { subject, sender, content, type } = req.body;
 
  try {
    console.log('📧 Hera a reçu un email de Echo:');
    console.log('   Sujet:', subject);
    console.log('   Expéditeur:', sender);
    console.log('   Contenu:', content);
   
    // Analyser l'email avec l'IA (optionnel)
    // Tu peux appeler Groq ici si tu veux qu'Hera analyse aussi
   
    // Stocker dans une collection "hera_emails" si besoin
    // await HeraEmail.create({ subject, sender, content, receivedAt: new Date() });
   
    res.json({
      success: true,
      message: 'Email reçu par Hera',
      receivedAt: new Date().toISOString(),
      email: { subject, sender, content }
    });
   
  } catch (error) {
    console.error('❌ Erreur receiveEmailFromEcho:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
