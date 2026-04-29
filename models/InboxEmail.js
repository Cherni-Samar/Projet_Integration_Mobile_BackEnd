const mongoose = require('mongoose');

const inboxEmailSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    sender: { type: String, required: true, trim: true },
    content: { type: String, default: '' },
    summary: { type: String, default: '' },
    isUrgent: { type: Boolean, default: false },
    isSpam: { type: Boolean, default: false, index: true },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
    category: { type: String, default: 'inbox' },
    actions: [{ type: String }],
    isRead: { type: Boolean, default: false },
    receivedAt: { type: Date, default: Date.now },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    inReplyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InboxEmail',
      default: null,
    },
    to: { type: String, trim: true, default: null },
    willSendIn: { type: String, default: null },
    source: {
      type: String,
      enum: ['inbox', 'receive', 'spam_check', 'manual', 'auto_reply_pending'],
      default: 'inbox',
    },
  },
  { timestamps: true }
);

inboxEmailSchema.index({ receivedAt: -1 });
inboxEmailSchema.index({ ownerId: 1, receivedAt: -1 });

module.exports = mongoose.model('InboxEmail', inboxEmailSchema, 'emails');
