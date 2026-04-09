const Employee = require('../models/Employee');

const checkExpiringContracts = async () => {
  try {
    const today = new Date();
    const in30Days = new Date();
    in30Days.setDate(today.getDate() + 30);

    const expiringEmployees = await Employee.find({
      'contract.end': { $gte: today, $lte: in30Days }
    });

    console.log(`🔍 Contrats expirant dans 30j : ${expiringEmployees.length}`);

    return expiringEmployees;
  } catch (err) {
    console.error('❌ Erreur contractCron:', err.message);
  }
};

module.exports = { checkExpiringContracts };