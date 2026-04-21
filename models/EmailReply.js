const mongoose = require('mongoose');

const emailReplySchema = new mongoose.Schema(
  {
    emailId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InboxEmail',
      required: true,
      index: true,
    },
    replyContent: { type: String, required: true },
    sentAt: { type: Date, default: Date.now, index: true },
    sentBy: { type: String, default: 'echo@e-team.com', trim: true },
    channel: { type: String, trim: true, default: 'smtp' },
    status: {
      type: String,
      enum: ['sent', 'failed'],
      default: 'sent',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

emailReplySchema.index({ emailId: 1, sentAt: -1 });

module.exports = mongoose.model('EmailReply', emailReplySchema, 'email_replies');
