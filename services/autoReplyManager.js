const mongoose = require('mongoose');
const emailSender = require('./emailSender');
const echoService = require('./echoService');
const inboxStatsService = require('./inboxStatsService');

class AutoReplyManager {
  constructor() {
    this.pendingReplies = new Map();
    this.delayMinutes = 3;
  }

  scheduleReply(email, analysis, replyText) {
    const emailId = email.id;
   
    console.log('⏰ Planification reponse auto dans ' + this.delayMinutes + ' minutes pour: ' + email.subject);
   
    const timer = setTimeout(async () => {
      await this.sendAutoReply(emailId);
    }, this.delayMinutes * 60 * 1000);
   
    this.pendingReplies.set(emailId, {
      timer,
      email,
      analysis,
      replyText,
      scheduledAt: new Date()
    });
   
    return { scheduled: true, delayMinutes: this.delayMinutes };
  }

  cancelReply(emailId, reason) {
    const pending = this.pendingReplies.get(emailId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingReplies.delete(emailId);
      console.log('✅ Reponse auto annulee pour ' + emailId + ' - ' + reason);
      return true;
    }
    return false;
  }

  async sendAutoReply(emailId) {
    const pending = this.pendingReplies.get(emailId);
    if (!pending) {
      console.log('⚠️ Aucune reponse en attente pour ' + emailId);
      return false;
    }
   
    const { email, replyText } = pending;
   
    console.log('🤖 Envoi reponse automatique pour: ' + email.subject);
   
    try {
      const sendResult = await emailSender.sendEmail({
        to: email.sender,
        subject: 'Re: ' + email.subject,
        content: replyText,
        from: 'echo@e-team.com'
      });
     
      if (sendResult.success) {
        console.log('✅ Reponse auto envoyee a ' + email.sender);
        try {
          if (mongoose.Types.ObjectId.isValid(emailId)) {
            await inboxStatsService.recordReply({
              emailId: new mongoose.Types.ObjectId(emailId),
              replyContent: replyText,
              sentBy: 'echo@e-team.com',
              channel: 'smtp',
              status: 'sent',
            });
          }
        } catch (dbErr) {
          console.error('❌ Persistance EmailReply (auto):', dbErr.message);
        }
        this.pendingReplies.delete(emailId);
        return true;
      }
    } catch (error) {
      console.error('❌ Erreur envoi auto:', error.message);
    }
   
    return false;
  }

  getPendingStatus() {
    const status = [];
    for (const [id, pending] of this.pendingReplies) {
      const elapsed = (Date.now() - pending.scheduledAt) / 1000 / 60;
      const remaining = Math.max(0, this.delayMinutes - elapsed);
      status.push({
        emailId: id,
        subject: pending.email.subject,
        sender: pending.email.sender,
        scheduledAt: pending.scheduledAt,
        remainingMinutes: remaining,
        willSendIn: Math.ceil(remaining) + ' minute' + (Math.ceil(remaining) > 1 ? 's' : '')
      });
    }
    return status;
  }
}

module.exports = new AutoReplyManager();