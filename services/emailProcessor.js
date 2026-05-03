const emailCollector = require('./emailCollector');
const aiAnalyzer = require('./aiAnalyzer');
const emailNotifier = require('./emailNotifier');
const crypto = require('crypto');

// Generate UUID v4
function uuidv4() {
  return crypto.randomUUID();
}

class EmailProcessor {
  constructor() {
    this.isProcessing = false;
    this.currentSessionId = null;
  }

  /**
   * Main processing workflow
   * @param {string} trigger - 'cron' or 'manual'
   * @returns {Promise<Object>} Processing results
   */
  async processEmails(trigger = 'cron') {
    // Prevent overlapping sessions
    if (this.isProcessing) {
      console.log('[EmailProcessor] ⚠️ Processing already in progress, skipping');
      return {
        success: false,
        message: 'Processing session already in progress'
      };
    }

    this.isProcessing = true;
    this.currentSessionId = uuidv4();
    const sessionStart = Date.now();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[EmailProcessor] 🚀 Starting processing session`);
    console.log(`Session ID: ${this.currentSessionId}`);
    console.log(`Trigger: ${trigger}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`${'='.repeat(60)}\n`);

    const results = {
      sessionId: this.currentSessionId,
      trigger,
      startTime: new Date(),
      totalProcessed: 0,
      importantCount: 0,       // backward compat: medium + high
      lowImportanceCount: 0,
      mediumImportanceCount: 0,
      highImportanceCount: 0,
      notificationsSent: 0,
      notificationsFailed: 0,
      errors: [],
      success: false
    };

    try {
      // Step 1: Collect emails from Gmail
      console.log('[EmailProcessor] Step 1: Collecting emails from Gmail...');
      const emails = await emailCollector.fetchUnreadEmails(
        parseInt(process.env.EMAIL_PROCESSING_BATCH_SIZE) || 50
      );

      if (emails.length === 0) {
        console.log('[EmailProcessor] ✅ No new emails to process');
        results.success = true;
        results.message = 'No new emails';
        return results;
      }

      console.log(`[EmailProcessor] Found ${emails.length} new emails\n`);
      results.totalProcessed = emails.length;

      // Step 2: Analyze emails with AI
      console.log('[EmailProcessor] Step 2: Analyzing emails with Groq AI...');
      const analyses = await aiAnalyzer.analyzeEmailsBatch(emails);

      // Step 3: Process each email
      console.log('[EmailProcessor] Step 3: Processing emails (simplified forwarding)...\n');

      const emailsToNotify = [];

      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        const analysis = analyses[i];

        try {
          console.log(`[EmailProcessor] Processing ${i + 1}/${emails.length}: ${email.subject}`);

          // Merge email data with analysis (in-memory only, no DB writes)
          const emailData = { ...email, ...analysis };

          // Determine importance level
          let importanceLevel = analysis.importanceLevel;
          if (!importanceLevel) {
            if (analysis.importanceScore >= 75) importanceLevel = 'high';
            else if (analysis.importanceScore >= 50) importanceLevel = 'medium';
            else importanceLevel = 'low';
          }

          switch (importanceLevel) {
            case 'low':
              results.lowImportanceCount++;
              break;
            case 'medium':
              results.mediumImportanceCount++;
              results.importantCount++;
              break;
            case 'high':
              results.highImportanceCount++;
              results.importantCount++;
              break;
            default:
              results.lowImportanceCount++;
              importanceLevel = 'low';
          }

          // Queue for notification if medium or high
          if (analysis.isImportant) {
            emailsToNotify.push({
              email: emailData,
              responsiblePerson: null // Direct to default Telegram chat
            });
          }

          // Mark email as read in Gmail after successful processing
          if (process.env.GMAIL_MARK_READ_AFTER_PROCESS === 'true') {
            await emailCollector.markAsRead(email.emailId);
          }

          console.log(`[EmailProcessor] ✅ Processed email ${email.emailId} (${importanceLevel} importance, score: ${analysis.importanceScore})`);

        } catch (error) {
          console.error(`[EmailProcessor] ❌ Error processing email ${email.emailId}:`, error.message);
          results.errors.push({
            emailId: email.emailId,
            subject: email.subject,
            error: error.message,
            importanceLevel: analysis?.importanceLevel || 'unknown',
            importanceScore: analysis?.importanceScore || 0
          });
        }
      }

      // Step 4: Send notifications for medium and high importance emails
      if (emailsToNotify.length > 0) {
        console.log(`\n[EmailProcessor] Step 4: Sending ${emailsToNotify.length} notifications...\n`);

        const notificationResults = await emailNotifier.sendBatchNotifications(emailsToNotify);
        results.notificationsSent = notificationResults.sent;
        results.notificationsFailed = notificationResults.failed;

        console.log(`[EmailProcessor] ✅ Notifications processed: ${results.notificationsSent} sent, ${results.notificationsFailed} failed, ${notificationResults.filtered || 0} filtered (low importance)`);
      } else {
        console.log(`\n[EmailProcessor] Step 4: No notifications to send (all emails were low importance)\n`);
      }

      results.success = true;
      results.message = `Processed ${results.totalProcessed} emails: ${results.lowImportanceCount} low, ${results.mediumImportanceCount} medium, ${results.highImportanceCount} high importance`;

    } catch (error) {
      console.error('[EmailProcessor] ❌ Fatal error in processing session:', error.message);
      results.success = false;
      results.message = error.message;
      results.errors.push({ component: 'EmailProcessor', error: error.message });
    } finally {
      this.isProcessing = false;

      const duration = ((Date.now() - sessionStart) / 1000).toFixed(2);
      results.endTime = new Date();
      results.durationSeconds = parseFloat(duration);

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[EmailProcessor] 📊 Session Summary`);
      console.log(`${'='.repeat(60)}`);
      console.log(`Status: ${results.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`Duration: ${duration}s`);
      console.log(`Emails Processed: ${results.totalProcessed}`);
      console.log(`📊 Three-Level Classification:`);
      console.log(`   🔵 Low Importance (0-49): ${results.lowImportanceCount}`);
      console.log(`   🟡 Medium Importance (50-74): ${results.mediumImportanceCount}`);
      console.log(`   🔴 High Importance (75-100): ${results.highImportanceCount}`);
      console.log(`📧 Notification Results:`);
      console.log(`   ✅ Notifications Sent: ${results.notificationsSent}`);
      console.log(`   ❌ Notifications Failed: ${results.notificationsFailed}`);
      console.log(`   📊 Total Notifiable: ${results.importantCount} (medium + high)`);
      console.log(`Errors: ${results.errors.length}`);
      console.log(`${'='.repeat(60)}\n`);

      // Send Telegram summary if there were important emails
      if (results.importantCount > 0) {
        await emailNotifier.sendProcessingSummary(results);
      }

      return results;
    }
  }

  /**
   * Check if processing is currently running
   * @returns {boolean}
   */
  isCurrentlyProcessing() {
    return this.isProcessing;
  }

  /**
   * Get current session ID
   * @returns {string|null}
   */
  getCurrentSessionId() {
    return this.currentSessionId;
  }
}

module.exports = new EmailProcessor();
