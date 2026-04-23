const express = require('express');
const router = express.Router();
const multer = require('multer');
const kashController = require('../controllers/kashController');
const auth = require('../middleware/authMiddleware');
const employeeAuth = require('../middleware/employeeAuthMiddleware');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Allowed: ${allowedMimes.join(', ')}`));
    }
  }
});

// Analyze & Add Expense
router.post('/analyze', auth, kashController.analyzeReceipt);
router.post('/add', auth, kashController.addExpense);

// Expenses
router.get('/expenses', auth, kashController.getExpenses);

// Budget Management
router.get('/budget', auth, kashController.getBudget);
router.post('/budget', auth, kashController.setBudget);
router.post('/budget/create', auth, kashController.createBudget);
router.post('/recalculate-budget', auth, kashController.recalculateBudget);

// Hiring Feasibility Check
router.get('/check-hiring', auth, kashController.checkHiringFeasibility);

// Reminders
router.get('/reminders', auth, kashController.getReminders);
router.post('/reminders', auth, kashController.createReminder);
router.patch('/reminders/:id/mark-paid', auth, kashController.markReminderPaid);

// Employee Expense Submission (file upload)
router.post('/employee/upload', employeeAuth, upload.single('receipt'), kashController.submitEmployeeExpense);

module.exports = router;