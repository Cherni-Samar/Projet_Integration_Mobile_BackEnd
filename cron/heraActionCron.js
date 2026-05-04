/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HERA ACTION CRON JOB
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Periodically process pending HeraAction recruitment requests
 * Schedule: Every 2 minutes
 * 
 * This cron job monitors the HeraAction collection for pending recruitment
 * requests and triggers the HeraActionProcessor to validate budgets with Kash.
 * 
 * Author: Backend Team
 * Created: 2026-05-04
 * ═══════════════════════════════════════════════════════════════════════════
 */

const cron = require('node-cron');
const HeraActionProcessor = require('../services/hera/heraActionProcessor.service');

let cronJob = null;
let isRunning = false;

/**
 * Start the Hera Action cron job
 * Runs every 2 minutes
 */
function startHeraActionCron() {
  if (cronJob) {
    console.log('[HERA CRON] ⚠️  Cron job already running');
    return;
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('[HERA CRON] 🚀 Starting Hera Action Processor Cron Job');
  console.log('[HERA CRON] ⏰ Schedule: Every 2 minutes');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Schedule: Every 2 minutes
  // Cron format: */2 * * * * = every 2 minutes
  cronJob = cron.schedule('*/2 * * * *', async () => {
    
    // Prevent concurrent executions
    if (isRunning) {
      console.log('[HERA CRON] ⏭️  Skipping execution (previous run still in progress)');
      return;
    }

    isRunning = true;
    const startTime = Date.now();

    try {
      console.log(`[HERA CRON] ⏰ Triggered at ${new Date().toISOString()}`);
      
      const result = await HeraActionProcessor.processRecruitmentRequests();
      
      const duration = Date.now() - startTime;
      
      if (result.success && result.processed > 0) {
        console.log(`[HERA CRON] ✅ Completed in ${duration}ms - Processed ${result.processed} request(s)`);
      } else if (result.success && result.processed === 0) {
        console.log(`[HERA CRON] ℹ️  Completed in ${duration}ms - No pending requests`);
      } else {
        console.log(`[HERA CRON] ⚠️  Completed with errors in ${duration}ms`);
      }
      
    } catch (error) {
      console.error('[HERA CRON] ❌ Fatal error during cron execution:', error);
    } finally {
      isRunning = false;
    }
  });

  console.log('[HERA CRON] ✅ Cron job started successfully\n');
}

/**
 * Stop the Hera Action cron job
 */
function stopHeraActionCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('[HERA CRON] 🛑 Cron job stopped');
  } else {
    console.log('[HERA CRON] ⚠️  No cron job to stop');
  }
}

/**
 * Get cron job status
 */
function getHeraActionCronStatus() {
  return {
    isActive: cronJob !== null,
    isRunning: isRunning,
    schedule: '*/2 * * * *',
    description: 'Every 2 minutes'
  };
}

/**
 * Manual trigger for testing
 * Bypasses the cron schedule
 */
async function triggerHeraActionNow() {
  console.log('[HERA CRON] 🔧 Manual trigger initiated');
  
  if (isRunning) {
    return {
      success: false,
      message: 'A processing run is already in progress'
    };
  }

  isRunning = true;
  
  try {
    const result = await HeraActionProcessor.processRecruitmentRequests();
    return result;
  } catch (error) {
    console.error('[HERA CRON] ❌ Error during manual trigger:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    isRunning = false;
  }
}

module.exports = {
  startHeraActionCron,
  stopHeraActionCron,
  getHeraActionCronStatus,
  triggerHeraActionNow
};
