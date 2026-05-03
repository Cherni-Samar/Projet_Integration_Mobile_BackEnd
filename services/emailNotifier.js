const TelegramBot = require('node-telegram-bot-api');

class EmailNotifier {
  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    this.bot = token ? new TelegramBot(token, { polling: false }) : null;
    this.defaultChatId = process.env.DEFAULT_RESPONSIBLE_PERSON_TELEGRAM_ID || process.env.TELEGRAM_CHAT_ID;

    if (!this.bot) {
      console.warn('⚠️ Telegram bot not configured for email notifications');
    }
  }

  /**
   * Send notification for important email
   * @param {Object} emailData - Email with analysis results
   * @param {Object} responsiblePerson - Person to notify
   * @returns {Promise<boolean>} Success status
   */
  async sendImportantEmailNotification(emailData, responsiblePerson) {
    if (!this.bot) {
      console.error('[EmailNotifier] Telegram bot not configured');
      return false;
    }

    // Skip low importance emails (score 0-49)
    const isLowImportance = emailData.importanceLevel === 'low' ||
      (emailData.importanceScore !== undefined && emailData.importanceScore < 50);

    if (isLowImportance) {
      console.log(`[EmailNotifier] Skipping notification for low importance email (score: ${emailData.importanceScore}, level: ${emailData.importanceLevel})`);
      return false;
    }

    // Only notify for medium (50-74) and high (75-100)
    const isMediumOrHigh = emailData.importanceLevel === 'medium' ||
      emailData.importanceLevel === 'high' ||
      (emailData.importanceScore !== undefined && emailData.importanceScore >= 50);

    if (!isMediumOrHigh) {
      console.log(`[EmailNotifier] Skipping notification for unrecognized importance level: ${emailData.importanceLevel} (score: ${emailData.importanceScore})`);
      return false;
    }

    try {
      const chatId = responsiblePerson?.telegramId || this.defaultChatId;

      if (!chatId) {
        console.error('[EmailNotifier] No Telegram chat ID available');
        return false;
      }

      const message = this.formatEmailNotification(emailData, responsiblePerson);

      console.log(`[EmailNotifier] Sending notification to ${chatId} for ${emailData.importanceLevel || 'score-based'} importance email`);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });

      console.log(`[EmailNotifier] ✅ Notification sent successfully`);
      return true;

    } catch (error) {
      console.error('[EmailNotifier] Error sending notification:', error.message);

      // Rate limit retry
      if (error.response?.statusCode === 429) {
        const retryAfter = error.response.parameters?.retry_after || 5;
        console.log(`[EmailNotifier] Rate limited, retrying after ${retryAfter}s`);
        await this.sleep(retryAfter * 1000);
        return await this.sendImportantEmailNotification(emailData, responsiblePerson);
      }

      return false;
    }
  }

  /**
   * Format email notification message
   * @param {Object} emailData - Email with analysis
   * @param {Object} responsiblePerson - Assigned person
   * @returns {string} Formatted HTML message
   */
  formatEmailNotification(emailData, responsiblePerson) {
    const importanceLevel = emailData.importanceLevel || this.getImportanceLevelFromScore(emailData.importanceScore);

    let message;
    if (importanceLevel === 'high' || emailData.importanceScore >= 75) {
      message = `<b>EMAIL IMPORTANT</b>\n`;
    } else {
      message = `<b>EMAIL MOYEN</b>\n`;
    }

    const senderAddress = emailData.sender?.address || emailData.sender || '';
    const senderName = emailData.sender?.name || '';
    const senderDisplay = senderName ? `${senderName} &lt;${senderAddress}&gt;` : senderAddress;
    message += `<b>De:</b> ${senderDisplay}\n`;
    message += `<b>Sujet:</b> ${emailData.subject}\n\n`;
    message += `${emailData.body || emailData.content || emailData.snippet || ''}`;

    return message;
  }

  /**
   * Get importance level from score (backward compatibility)
   * @param {number} score
   * @returns {string}
   */
  getImportanceLevelFromScore(score) {
    if (score < 50) return 'low';
    if (score < 75) return 'medium';
    return 'high';
  }

  /**
   * Format category for display
   * @param {string} category
   * @returns {string}
   */
  formatCategory(category) {
    const categoryMap = {
      urgent_meeting: 'Urgent Meeting',
      contract_review: 'Contract Review',
      financial_matter: 'Financial Matter',
      partnership_proposal: 'Partnership Proposal',
      customer_complaint: 'Customer Complaint',
      sales_opportunity: 'Sales Opportunity',
      hr_matter: 'HR Matter',
      technical_issue: 'Technical Issue',
      marketing_campaign: 'Marketing Campaign',
      general_inquiry: 'General Inquiry',
      newsletter: 'Newsletter',
      notification: 'Notification',
      spam: 'Spam',
      other: 'Other'
    };
    return categoryMap[category] || 'Other';
  }

  /**
   * Format date for display
   * @param {Date} date
   * @returns {string}
   */
  formatDate(date) {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Send batch notifications for multiple emails
   * @param {Array} emailsWithResponsible - Array of {email, responsiblePerson}
   * @returns {Promise<Object>} Results summary
   */
  async sendBatchNotifications(emailsWithResponsible) {
    console.log(`[EmailNotifier] Processing ${emailsWithResponsible.length} emails for notifications`);

    const filteredEmails = emailsWithResponsible.filter(({ email }) => {
      const isLowImportance = email.importanceLevel === 'low' ||
        (email.importanceScore !== undefined && email.importanceScore < 50);
      const shouldNotify = !isLowImportance;
      if (!shouldNotify) {
        console.log(`[EmailNotifier] Filtering out low importance email: ${email.subject} (score: ${email.importanceScore}, level: ${email.importanceLevel})`);
      }
      return shouldNotify;
    });

    console.log(`[EmailNotifier] Sending ${filteredEmails.length} notifications (${emailsWithResponsible.length - filteredEmails.length} filtered out)`);

    const results = {
      sent: 0,
      failed: 0,
      filtered: emailsWithResponsible.length - filteredEmails.length,
      errors: []
    };

    for (const { email, responsiblePerson } of filteredEmails) {
      const success = await this.sendImportantEmailNotification(email, responsiblePerson);

      if (success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({ emailId: email.emailId, subject: email.subject });
      }

      // Small delay to avoid Telegram rate limiting
      await this.sleep(500);
    }

    console.log(`[EmailNotifier] Batch complete: ${results.sent} sent, ${results.failed} failed, ${results.filtered} filtered`);
    return results;
  }

  /**
   * Send summary notification with three-level classification breakdown
   * @param {Object} summary - Processing session summary
   * @returns {Promise<boolean>}
   */
  async sendProcessingSummary(summary) {
    if (!this.bot || !this.defaultChatId) {
      return false;
    }

    try {
      const successRate = summary.totalProcessed > 0
        ? Math.round((summary.notificationsSent / summary.importantCount) * 100)
        : 100;

      const statusEmoji = summary.success ? '✅' : '❌';
      const lowCount = summary.lowImportanceCount || 0;
      const mediumCount = summary.mediumImportanceCount || 0;
      const highCount = summary.highImportanceCount || 0;

      const message = `
${statusEmoji} <b>EMAIL PROCESSING SUMMARY</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>📊 SESSION STATISTICS</b>
⏱️ Completed: ${this.formatDate(new Date())}
⏳ Duration: ${summary.durationSeconds}s

<b>📧 PROCESSING RESULTS</b>
📥 Total Processed: <b>${summary.totalProcessed}</b>

<b>🎯 THREE-LEVEL CLASSIFICATION</b>
🔵 Low Importance (0-49): <b>${lowCount}</b>
🟡 Medium Importance (50-74): <b>${mediumCount}</b>
🔴 High Importance (75-100): <b>${highCount}</b>

<b>📬 NOTIFICATION RESULTS</b>
✅ Notifications Sent: <b>${summary.notificationsSent}</b>
${summary.notificationsFailed > 0 ? `❌ Failed: <b>${summary.notificationsFailed}</b>\n` : ''}📊 Notifiable Emails: <b>${summary.importantCount}</b> (medium + high)
<b>📈 Success Rate: ${successRate}%</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>CEO Email Intelligence System</i>
      `.trim();

      await this.bot.sendMessage(this.defaultChatId, message, { parse_mode: 'HTML' });
      return true;
    } catch (error) {
      console.error('[EmailNotifier] Error sending summary:', error.message);
      return false;
    }
  }

  /**
   * Send a test notification to verify Telegram connectivity
   * @returns {Promise<boolean>}
   */
  async sendTestNotification() {
    if (!this.bot || !this.defaultChatId) {
      console.error('[EmailNotifier] Telegram not configured');
      return false;
    }

    try {
      const message = `
🧪 <b>SYSTEM TEST NOTIFICATION</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>✅ CONNECTION STATUS</b>
Telegram Bot: <b>Connected</b>
Notification Service: <b>Operational</b>

<b>📋 TEST DETAILS</b>
Timestamp: ${this.formatDate(new Date())}
Chat ID: <code>${this.defaultChatId}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>CEO Email Intelligence System</i>
      `.trim();

      await this.bot.sendMessage(this.defaultChatId, message, { parse_mode: 'HTML' });
      console.log('[EmailNotifier] ✅ Test notification sent successfully');
      return true;
    } catch (error) {
      console.error('[EmailNotifier] ❌ Test notification failed:', error.message);
      return false;
    }
  }

  /**
   * Sleep utility
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new EmailNotifier();
