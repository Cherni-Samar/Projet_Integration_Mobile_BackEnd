const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID requis'],
    },
    title: {
      type: String,
      required: [true, 'Titre du rappel requis'],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Montant requis'],
      min: [0, 'Le montant doit être positif'],
    },
    currency: {
      type: String,
      default: 'TND',
      trim: true,
    },
    dueDate: {
      type: Date,
      required: [true, 'Date d\'échéance requise'],
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending',
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Reminder', reminderSchema);
