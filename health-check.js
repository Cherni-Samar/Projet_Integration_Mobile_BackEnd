#!/usr/bin/env node
/**
 * Health Check & Auto-Repair System for Dexo Telegram Integration
 * Runs automated diagnostics and repairs
 * 
 * Usage: npm run health-check
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const HEALTH_CONFIG = {
  checkInterval: 5 * 60 * 1000, // 5 minutes
  logDir: path.join(__dirname, 'logs'),
  alertThreshold: 3 // Fail 3 times before alerting
};

// Ensure logs directory exists
if (!fs.existsSync(HEALTH_CONFIG.logDir)) {
  fs.mkdirSync(HEALTH_CONFIG.logDir, { recursive: true });
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

class HealthChecker {
  constructor() {
    this.failures = {};
    this.lastCheck = null;
  }

  async check(name, testFn) {
    try {
      await testFn();
      this.recordSuccess(name);
      return { status: 'healthy', name };
    } catch (error) {
      this.recordFailure(name, error);
      return { status: 'unhealthy', name, error: error.message };
    }
  }

  recordSuccess(name) {
    if (this.failures[name]) {
      delete this.failures[name];
      this.log(`✅ ${name} - RECOVERED`);
    }
  }

  recordFailure(name, error) {
    if (!this.failures[name]) {
      this.failures[name] = { count: 0, firstFailure: Date.now() };
    }
    this.failures[name].count++;
    this.failures[name].lastError = error.message;
    this.failures[name].lastFailure = Date.now();

    if (this.failures[name].count >= HEALTH_CONFIG.alertThreshold) {
      this.alert(name, error);
    }

    this.log(`❌ ${name} - FAILED (${this.failures[name].count}/${HEALTH_CONFIG.alertThreshold})`);
  }

  alert(name, error) {
    const message = `🚨 ALERT: ${name} has failed ${this.failures[name].count} times\n${error.message}`;
    this.log(message);
    
    // Save alert to file for external monitoring
    const alertFile = path.join(HEALTH_CONFIG.logDir, 'alerts.log');
    fs.appendFileSync(alertFile, `[${new Date().toISOString()}] ${message}\n`);
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logFile = path.join(HEALTH_CONFIG.logDir, 'health-check.log');
    const logLine = `[${timestamp}] ${message}`;
    
    console.log(logLine);
    fs.appendFileSync(logFile, logLine + '\n');
  }

  getStatus() {
    const unhealthy = Object.entries(this.failures)
      .filter(([_, v]) => v.count > 0)
      .map(([name, data]) => ({ name, failures: data.count, lastError: data.lastError }));

    return {
      timestamp: new Date().toISOString(),
      overallHealth: unhealthy.length === 0 ? 'healthy' : 'degraded',
      unhealthy,
      failureCount: unhealthy.reduce((sum, u) => sum + u.failures, 0)
    };
  }
}

// ============================================================================
// AUTOMATED CHECKS
// ============================================================================

const checker = new HealthChecker();

async function checkEnvVariables() {
  const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'MONGODB_URI'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }
}

async function checkDexoServiceSyntax() {
  const filePath = path.join(__dirname, 'services/dexoService.js');
  if (!fs.existsSync(filePath)) {
    throw new Error('dexoService.js not found');
  }

  try {
    require(filePath);
  } catch (error) {
    throw new Error(`dexoService.js has syntax error: ${error.message}`);
  }
}

async function checkKashCronSyntax() {
  const filePath = path.join(__dirname, 'cron/kashCron.js');
  if (!fs.existsSync(filePath)) {
    throw new Error('kashCron.js not found');
  }

  try {
    require(filePath);
  } catch (error) {
    throw new Error(`kashCron.js has syntax error: ${error.message}`);
  }
}

async function checkTelegramBotAccess() {
  try {
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    await bot.getMe();
  } catch (error) {
    throw new Error(`Telegram bot access failed: ${error.message}`);
  }
}

async function checkDependencies() {
  const required = ['node-telegram-bot-api', 'nodemailer', 'mongoose', 'node-cron'];
  const missing = [];

  for (const pkg of required) {
    try {
      require.resolve(pkg);
    } catch {
      missing.push(pkg);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing packages: ${missing.join(', ')}`);
  }
}

// ============================================================================
// AUTO-REPAIR SYSTEM
// ============================================================================

async function autoRepairMissingModules() {
  const pkgJsonPath = path.join(__dirname, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error('package.json not found');
  }

  // This would need npm to be available
  // In production, trigger a CI/CD pipeline instead
  console.log('⚠️ Missing modules detected. Trigger: npm install');
}

// ============================================================================
// MONITORING DASHBOARD
// ============================================================================

function displayDashboard(status) {
  console.clear();
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   🏥 Dexo Telegram Integration - Health Monitor               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const healthIcon = status.overallHealth === 'healthy' ? '🟢' : '🟠';
  console.log(`${healthIcon} Overall Health: ${status.overallHealth.toUpperCase()}`);
  console.log(`⏰ Last Check: ${status.timestamp}`);
  console.log(`\n📊 Failures: ${status.failureCount}\n`);

  if (status.unhealthy.length === 0) {
    console.log('✅ All systems operational!\n');
  } else {
    console.log('⚠️  Issues Detected:\n');
    status.unhealthy.forEach(issue => {
      console.log(`  ❌ ${issue.name}`);
      console.log(`     Failures: ${issue.failures}`);
      console.log(`     Error: ${issue.lastError}\n`);
    });
  }

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║ Next check in ${HEALTH_CONFIG.checkInterval / 1000}s...                         ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');
}

// ============================================================================
// MAIN MONITORING LOOP
// ============================================================================

async function runHealthCheck() {
  checker.log('🔍 Starting health check...');

  // Run all checks
  await checker.check('Environment Variables', checkEnvVariables);
  await checker.check('Dexo Service Syntax', checkDexoServiceSyntax);
  await checker.check('Kash Cron Syntax', checkKashCronSyntax);
  await checker.check('Telegram Bot Access', checkTelegramBotAccess);
  await checker.check('Dependencies', checkDependencies);

  // Display dashboard
  const status = checker.getStatus();
  displayDashboard(status);

  // Auto-repair if needed
  if (status.overallHealth === 'degraded') {
    checker.log('🔧 Attempting auto-repair...');
    try {
      await autoRepairMissingModules();
    } catch (error) {
      checker.log(`Auto-repair failed: ${error.message}`);
    }
  }

  // Save status to file for CI/CD integration
  const statusFile = path.join(HEALTH_CONFIG.logDir, 'status.json');
  fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));

  checker.log('✅ Health check completed');
}

// ============================================================================
// START CONTINUOUS MONITORING
// ============================================================================

console.log('🚀 Starting Health Monitor...\n');
runHealthCheck();

// Run periodic checks
setInterval(() => {
  runHealthCheck();
}, HEALTH_CONFIG.checkInterval);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Health monitor shutting down...');
  const finalStatus = checker.getStatus();
  const reportFile = path.join(HEALTH_CONFIG.logDir, `final-report-${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(finalStatus, null, 2));
  console.log(`📁 Final report saved to: ${reportFile}`);
  process.exit(0);
});
