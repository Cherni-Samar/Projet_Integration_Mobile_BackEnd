const Employee = require('../models/Employee');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const employee = await Employee.findOne({ email }).select('+password');

    if (!employee) {
      return res.json({
        success: false,
        message: 'Employé non trouvé',
      });
    }

    // ❌ Compte désactivé
    if (employee.status === 'inactive') {
      return res.json({
        success: false,
        message: 'Compte désactivé. Contactez les RH.',
      });
    }

    if (!employee.password) {
      return res.json({
        success: false,
        message: 'Compte non configuré. Contactez les RH.',
      });
    }

    const valid = await bcrypt.compare(password, employee.password);

    if (!valid) {
      return res.json({
        success: false,
        message: 'Mot de passe incorrect',
      });
    }

    // ✅ Activation après onboarding
    if (employee.status === 'onboarding') {
      await Employee.findByIdAndUpdate(employee._id, {
        status: 'active',
        updated_at: new Date(),
      });
      employee.status = 'active';
    }

    const token = jwt.sign(
      { id: employee._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      data: {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        department: employee.department,
        leave_balance: employee.leave_balance,
        leave_balance_used: employee.leave_balance_used,
        status: employee.status,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};