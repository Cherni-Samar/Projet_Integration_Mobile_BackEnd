const cron = require('node-cron');
const emailProcessor = require('../services/emailProcessor');

class EmailProcessorCron {
  constructor() {
    this.cronJob = null;
    this.isEnabled = process.env.EMAIL_PROCESSING_CRON !== 'disabled';
    this.cronExpression = process.env.EMAIL_PROCESSING_CRON || '*/5 * * * *'; // Default: every 5 minutes
    this.businessHoursOnly = process.env.EMAIL_PROCESSING_BUSINESS_HOURS_ONLY === 'true';
  }

  /**
   * Start the cron job
   */
  start() {
    if (!this.isEnabled) {
      console.log('[EmailProcessorCron] ⚠️ Cron job is disabled');
      return;
    }

    if (this.cronJob) {
      console.log('[EmailProcessorCron] ⚠️ Cron job already running');
      return;
    }

    console.log('[EmailProcessorCron] 🚀 Starting email processing cron job');
    console.log(`[EmailProcessorCron] Schedule: ${this.cronExpression}`);
    console.log(`[EmailProcessorCron] Business hours only: ${this.businessHoursOnly}`);

    this.cronJob = cron.schedule(this.cronExpression, async () => {
      try {
        // Business hours check
        if (this.businessHoursOnly && !this.isBusinessHours()) {
          console.log('[EmailProcessorCron] ⏸️ Outside business hours, skipping');
          return;
        }

        // Prevent overlapping runs
        if (emailProcessor.isCurrentlyProcessing()) {
          console.log('[EmailProcessorCron] ⚠️ Previous session still running, skipping');
          return;
        }

        console.log('[EmailProcessorCron] ⏰ Triggering scheduled email processing');
        await emailProcessor.processEmails('cron');

      } catch (error) {
        console.error('[EmailProcessorCron] ❌ Error in cron job:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'UTC'
    });

    console.log('[EmailProcessorCron] ✅ Cron job started successfully');
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[EmailProcessorCron] ⏹️ Cron job stopped');
    }
  }

  /**
   * Check if current time is within business hours (Mon–Fri, 08:00–20:00)
   * @returns {boolean}
   */
  isBusinessHours() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday

    if (day === 0 || day === 6) return false;
    return hour >= 8 && hour < 20;
  }

  /**
   * Get cron job status
   * @returns {Object}
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      running: this.cronJob !== null,
      schedule: this.cronExpression,
      businessHoursOnly: this.businessHoursOnly,
      currentlyProcessing: emailProcessor.isCurrentlyProcessing(),
      currentSessionId: emailProcessor.getCurrentSessionId()
    };
  }

  /**
   * Update cron schedule at runtime
   * @param {string} newExpression - New cron expression
   */
  updateSchedule(newExpression) {
    if (!cron.validate(newExpression)) {
      throw new Error('Invalid cron expression');
    }

    this.stop();
    this.cronExpression = newExpression;
    this.start();

    console.log(`[EmailProcessorCron] ✅ Schedule updated to: ${newExpression}`);
  }
}

module.exports = new EmailProcessorCron();
