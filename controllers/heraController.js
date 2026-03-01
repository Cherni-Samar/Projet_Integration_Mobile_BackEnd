const Employee = require('../models/Employee');
const LeaveRequest = require('../models/LeaveRequest');
const HeraAction = require('../models/HeraAction');
const n8n = require('../services/n8n.service');

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
        res.status(500).json({ error: err.message });
    }
};

// ── Demande de congé ───────────────────────────────────────────────────────
exports.requestLeave = async (req, res) => {
    try {
        const { employee_id, type, start_date, end_date, days, reason } = req.body;

        // 1. Trouve employé
        const employee = await Employee.findById(employee_id);
        if (!employee) {
            return res.status(404).json({ error: 'Employé non trouvé' });
        }

        // 2. Vérifie solde
        if (employee.leave_balance < days) {
            return res.status(400).json({
                success: false,
                status: 'refused',
                message: `❌ Solde insuffisant — ${employee.leave_balance} jours restants`,
            });
        }

        // 3. Vérifie conflits
        const conflicts = await LeaveRequest.countDocuments({
            status: 'approved',
            start_date: { $lte: new Date(end_date) },
            end_date: { $gte: new Date(start_date) },
        });

        if (conflicts >= 3) {
            return res.status(400).json({
                success: false,
                status: 'refused',
                message: '❌ Trop de collègues absents sur cette période',
            });
        }

        // 4. Crée congé
        const leave = await LeaveRequest.create({
            employee_id, type,
            start_date, end_date,
            days, reason,
            status: 'approved',
            approved_by: 'Hera (auto)',
        });

        // 5. Met à jour solde
        await Employee.findByIdAndUpdate(employee_id, {
            $inc: { leave_balance: -days },
        });

        // 6. Log Hera
        await HeraAction.create({
            employee_id,
            action_type: 'leave_approved',
            details: { leave_id: leave._id, days, reason },
            triggered_by: 'auto',
        });

        console.log('📧 Envoi vers N8N :', {
            employee_name: employee.name,
            employee_email: employee.email,
            manager_email: employee.manager_email,
            type, start_date, end_date, days,
            status: 'approved',
        });

        // 7. Trigger N8N (email)
        await n8n.requestLeave({
            employee_name: employee.name,
            employee_email: employee.email,
            manager_email: employee.manager_email,
            type, start_date, end_date, days,
            status: 'approved',
        });

        res.json({
            success: true,
            status: 'approved',
            message: `✅ Congé approuvé — ${employee.leave_balance - days} jours restants`,
            leave_id: leave._id,
            balance_left: employee.leave_balance - days,
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Congé urgent ───────────────────────────────────────────────────────────
exports.urgentLeave = async (req, res) => {
    try {
        const { employee_id, reason } = req.body;

        const employee = await Employee.findById(employee_id);
        if (!employee) {
            return res.status(404).json({ error: 'Employé non trouvé' });
        }

        await HeraAction.create({
            employee_id,
            action_type: 'leave_urgent',
            details: { reason, priority: 'HIGH' },
            triggered_by: 'employee',
        });

        await n8n.urgentLeave({
            employee_name: employee.name,
            employee_email: employee.email,
            manager_email: employee.manager_email,
            reason,
        });

        res.json({
            success: true,
            message: '⚡ Congé urgent envoyé au manager — Réponse sous 2h',
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Onboarding ─────────────────────────────────────────────────────────────
exports.onboarding = async (req, res) => {
    try {
        const { name, email, role, department, contract_type, manager_email } = req.body;

        const employee = await Employee.create({
            name, email, role, department,
            contract: { type: contract_type, start: new Date() },
            manager_email,
            leave_balance: contract_type === 'Stage' ? 5 : 25,
        });

        await HeraAction.create({
            employee_id: employee._id,
            action_type: 'onboarding_started',
            details: { name, email, role },
            triggered_by: 'system',
        });

        await n8n.onboarding({
            employee_id: employee._id,
            name, email, role,
            department, contract_type, manager_email,
        });

        res.json({
            success: true,
            message: `✅ Onboarding démarré pour ${name}`,
            employee_id: employee._id,
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Promotion ──────────────────────────────────────────────────────────────
exports.promote = async (req, res) => {
    try {
        const { employee_id, new_role, new_salary } = req.body;

        const employee = await Employee.findById(employee_id);
        if (!employee) {
            return res.status(404).json({ error: 'Employé non trouvé' });
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
        res.status(500).json({ error: err.message });
    }
};

// ── Offboarding ────────────────────────────────────────────────────────────
exports.offboarding = async (req, res) => {
    try {
        const { employee_id, reason, last_day } = req.body;

        const employee = await Employee.findById(employee_id);
        if (!employee) {
            return res.status(404).json({ error: 'Employé non trouvé' });
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
            reason, last_day,
        });

        res.json({
            success: true,
            message: `🚪 Offboarding démarré pour ${employee.name}`,
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
    }
};