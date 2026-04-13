const express = require('express');
const router = express.Router();
const kashController = require('../controllers/kashController');
const auth = require('../middleware/authMiddleware');

// Analyze & Add Expense
router.post('/analyze', auth, kashController.analyzeReceipt);
router.post('/add', auth, kashController.addExpense);

// Expenses
router.get('/expenses', auth, kashController.getExpenses);

// Budget Management
router.get('/budget', auth, kashController.getBudget);
router.post('/budget', auth, kashController.setBudget);
router.post('/recalculate-budget', auth, kashController.recalculateBudget);

// Reminders
router.get('/reminders', auth, kashController.getReminders);
router.post('/reminders', auth, kashController.createReminder);
router.patch('/reminders/:id/mark-paid', auth, kashController.markReminderPaid);

module.exports = router;