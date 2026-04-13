const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: false,
    default: null,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'USD',
    trim: true,
  },
  vendor: {
    type: String,
    trim: true,
    default: null,
  },
  category: {
    type: String,
    default: 'Other',
  },
  description: {
    type: String,
    trim: true,
    default: null,
  },
  receiptUrl: {
    type: String,
    trim: true,
    default: null,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged'],
    default: 'pending',
  },
  isSubscription: {
    type: Boolean,
    default: false,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Expense', expenseSchema);
