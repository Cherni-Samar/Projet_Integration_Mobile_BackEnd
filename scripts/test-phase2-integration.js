#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 2 INTEGRATION TEST SCRIPT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Helper script to test Hera → Kash → Echo integration
 * 
 * Usage:
 *   node scripts/test-phase2-integration.js [command]
 * 
 * Commands:
 *   create-request    - Create a test recruitment request
 *   trigger           - Trigger the processor manually
 *   check-status      - Check status of recent requests
 *   check-linkedin    - Check LinkedIn authentication status
 *   reset-request     - Reset a request to pending_analysis
 * 
 * Examples:
 *   node scripts/test-phase2-integration.js create-request
 *   node scripts/test-phase2-integration.js trigger
 *   node scripts/test-phase2-integration.js check-status
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const HeraAction = require('../models/HeraAction');
const User = require('../models/User');
const Budget = require('../models/Budget');
require('dotenv').config();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '═'.repeat(70));
  log(title, 'bright');
  console.log('═'.repeat(70) + '\n');
}

async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/integration_mobile';
    await mongoose.connect(uri);
    log('✅ Connected to MongoDB', 'green');
    return true;
  } catch (error) {
    log(`❌ MongoDB connection failed: ${error.message}`, 'red');
    return false;
  }
}

async function createTestRequest() {
  logSection('📝 Creating Test Recruitment Request');
  
  try {
    // Find a CEO user
    const ceo = await User.findOne().sort({ createdAt: -1 });
    if (!ceo) {
      log('❌ No users found in database. Please create a user first.', 'red');
      return;
    }
    
    log(`Found CEO: ${ceo.email} (${ceo._id})`, 'cyan');
    
    // Check if CEO has a Salaries budget
    const budget = await Budget.findOne({
      managerId: ceo._id,
      category: 'Salaries',
      isActive: true
    });
    
    if (!budget) {
      log('⚠️  No Salaries budget found for this CEO', 'yellow');
      log('Creating a test budget...', 'cyan');
      
      await Budget.create({
        managerId: ceo._id,
        category: 'Salaries',
        limit: 500000,
        spent: 200000,
        currency: 'TND',
        isActive: true
      });
      
      log('✅ Test budget created: 500,000 TND (200,000 spent)', 'green');
    } else {
      log(`Budget found: ${budget.limit} ${budget.currency} (${budget.spent} spent)`, 'cyan');
    }
    
    // Create the recruitment request
    const testRequest = {
      ceo_id: ceo._id,
      action_type: 'hr_request',
      details: {
        type: 'recruitment',
        status: 'pending_analysis',
        role: 'Senior Full-Stack Developer',
        department: 'Tech',
        contract_type: 'CDI',
        headcount: 1,
        level: 'Senior',
        salary_budget: 50000,
        skills: ['Node.js', 'React', 'MongoDB', 'AI/ML', 'TypeScript'],
        reason: 'Team expansion for new AI product line - Phase 2 Integration Test',
        requested_by: 'CTO',
        requested_at: new Date()
      },
      triggered_by: 'manager'
    };
    
    const action = await HeraAction.create(testRequest);
    
    log('\n✅ Test request created successfully!', 'green');
    log(`\nRequest ID: ${action._id}`, 'bright');
    log(`Role: ${action.details.role}`, 'cyan');
    log(`Department: ${action.details.department}`, 'cyan');
    log(`Salary Budget: ${action.details.salary_budget} TND`, 'cyan');
    log(`Status: ${action.details.status}`, 'yellow');
    
    log('\n📋 Next steps:', 'bright');
    log('1. Run: node scripts/test-phase2-integration.js trigger', 'cyan');
    log('2. Or wait for the cron job (runs every 2 minutes)', 'cyan');
    log('3. Check status: node scripts/test-phase2-integration.js check-status', 'cyan');
    
  } catch (error) {
    log(`❌ Error creating test request: ${error.message}`, 'red');
    console.error(error);
  }
}

async function triggerProcessor() {
  logSection('🚀 Triggering Processor Manually');
  
  try {
    const HeraActionProcessor = require('../services/hera/heraActionProcessor.service');
    
    log('Starting processor...', 'cyan');
    const result = await HeraActionProcessor.processRecruitmentRequests();
    
    if (result.success) {
      log(`\n✅ Processing completed!`, 'green');
      log(`Processed: ${result.processed}`, 'cyan');
      log(`Success: ${result.successCount}`, 'green');
      log(`Failed: ${result.failCount}`, result.failCount > 0 ? 'red' : 'cyan');
      
      if (result.results && result.results.length > 0) {
        log('\n📊 Results:', 'bright');
        result.results.forEach((r, i) => {
          log(`\n${i + 1}. Action ID: ${r.actionId}`, 'cyan');
          log(`   Status: ${r.status}`, r.success ? 'green' : 'red');
          log(`   Message: ${r.message}`, 'cyan');
          
          if (r.linkedinPosting) {
            log(`   LinkedIn: ${r.linkedinPosting.success ? '✅ Posted' : '❌ Failed'}`, 
                r.linkedinPosting.success ? 'green' : 'red');
            if (r.linkedinPosting.postId) {
              log(`   Post ID: ${r.linkedinPosting.postId}`, 'cyan');
            }
            if (r.linkedinPosting.error) {
              log(`   Error: ${r.linkedinPosting.error}`, 'red');
            }
          }
        });
      }
    } else {
      log(`❌ Processing failed: ${result.error}`, 'red');
    }
    
  } catch (error) {
    log(`❌ Error triggering processor: ${error.message}`, 'red');
    console.error(error);
  }
}

async function checkStatus() {
  logSection('📊 Checking Recent Requests Status');
  
  try {
    const requests = await HeraAction.find({
      action_type: 'hr_request',
      'details.type': 'recruitment'
    })
    .sort({ created_at: -1 })
    .limit(5)
    .populate('ceo_id', 'email name')
    .lean();
    
    if (requests.length === 0) {
      log('No recruitment requests found in database.', 'yellow');
      log('Run: node scripts/test-phase2-integration.js create-request', 'cyan');
      return;
    }
    
    log(`Found ${requests.length} recent request(s):\n`, 'cyan');
    
    requests.forEach((req, i) => {
      const statusColor = 
        req.details.status === 'posted' ? 'green' :
        req.details.status === 'posting_failed' ? 'red' :
        req.details.status === 'budget_rejected' ? 'red' :
        req.details.status === 'budget_approved' ? 'yellow' :
        'cyan';
      
      log(`${i + 1}. ${req.details.role} (${req.details.department})`, 'bright');
      log(`   ID: ${req._id}`, 'cyan');
      log(`   Status: ${req.details.status}`, statusColor);
      log(`   Created: ${new Date(req.created_at).toLocaleString()}`, 'cyan');
      
      if (req.details.kash_validation) {
        log(`   Budget: ${req.details.kash_validation.canAfford ? '✅ Approved' : '❌ Rejected'}`, 
            req.details.kash_validation.canAfford ? 'green' : 'red');
      }
      
      if (req.details.echo_posting) {
        if (req.details.echo_posting.posted_at) {
          log(`   LinkedIn: ✅ Posted at ${new Date(req.details.echo_posting.posted_at).toLocaleString()}`, 'green');
          if (req.details.echo_posting.post_id) {
            log(`   Post ID: ${req.details.echo_posting.post_id}`, 'cyan');
          }
        } else if (req.details.echo_posting.failed_at) {
          log(`   LinkedIn: ❌ Failed at ${new Date(req.details.echo_posting.failed_at).toLocaleString()}`, 'red');
          log(`   Error: ${req.details.echo_posting.error}`, 'red');
        }
      }
      
      console.log('');
    });
    
  } catch (error) {
    log(`❌ Error checking status: ${error.message}`, 'red');
    console.error(error);
  }
}

async function checkLinkedIn() {
  logSection('🔗 Checking LinkedIn Authentication');
  
  try {
    const linkedinService = require('../services/echo/linkedin.service');
    const session = linkedinService.getSessionInfo();
    
    log('LinkedIn Session Info:', 'bright');
    log(`\nAuthenticated: ${session.hasAccessToken ? '✅ Yes' : '❌ No'}`, 
        session.hasAccessToken ? 'green' : 'red');
    log(`Has Person URN: ${session.hasPersonUrn ? '✅ Yes' : '❌ No'}`, 
        session.hasPersonUrn ? 'green' : 'red');
    
    if (session.personUrn) {
      log(`Person URN: ${session.personUrn}`, 'cyan');
    }
    
    log(`API Version: ${session.apiVersion}`, 'cyan');
    log(`Token File: ${session.tokenFileExists ? '✅ Exists' : '❌ Missing'}`, 
        session.tokenFileExists ? 'green' : 'red');
    
    if (session.hint) {
      log(`\n⚠️  ${session.hint}`, 'yellow');
    }
    
    if (!session.hasAccessToken) {
      log('\n📋 To authenticate LinkedIn:', 'bright');
      log('1. Start the server: npm start', 'cyan');
      log('2. Visit: http://localhost:3000/api/echo/linkedin/auth-url', 'cyan');
      log('3. Follow the OAuth flow', 'cyan');
    }
    
  } catch (error) {
    log(`❌ Error checking LinkedIn: ${error.message}`, 'red');
    console.error(error);
  }
}

async function resetRequest() {
  logSection('🔄 Reset Request to Pending Analysis');
  
  try {
    // Find the most recent request
    const request = await HeraAction.findOne({
      action_type: 'hr_request',
      'details.type': 'recruitment'
    }).sort({ created_at: -1 });
    
    if (!request) {
      log('No recruitment requests found.', 'yellow');
      return;
    }
    
    log(`Found request: ${request.details.role} (${request.details.department})`, 'cyan');
    log(`Current status: ${request.details.status}`, 'yellow');
    log(`ID: ${request._id}`, 'cyan');
    
    // Reset to pending_analysis
    await HeraAction.findByIdAndUpdate(request._id, {
      'details.status': 'pending_analysis',
      $unset: {
        'details.budget_check_started_at': '',
        'details.budget_check_completed_at': '',
        'details.kash_validation': '',
        'details.linkedin_posting_started_at': '',
        'details.echo_posting': ''
      }
    });
    
    log('\n✅ Request reset to pending_analysis', 'green');
    log('You can now trigger the processor again.', 'cyan');
    
  } catch (error) {
    log(`❌ Error resetting request: ${error.message}`, 'red');
    console.error(error);
  }
}

async function showHelp() {
  logSection('📚 Phase 2 Integration Test Script - Help');
  
  console.log('Usage: node scripts/test-phase2-integration.js [command]\n');
  console.log('Commands:');
  console.log('  create-request    Create a test recruitment request');
  console.log('  trigger           Trigger the processor manually');
  console.log('  check-status      Check status of recent requests');
  console.log('  check-linkedin    Check LinkedIn authentication status');
  console.log('  reset-request     Reset most recent request to pending_analysis');
  console.log('  help              Show this help message\n');
  console.log('Examples:');
  console.log('  node scripts/test-phase2-integration.js create-request');
  console.log('  node scripts/test-phase2-integration.js trigger');
  console.log('  node scripts/test-phase2-integration.js check-status\n');
}

async function main() {
  const command = process.argv[2];
  
  if (!command || command === 'help') {
    showHelp();
    return;
  }
  
  const connected = await connectDB();
  if (!connected) {
    process.exit(1);
  }
  
  try {
    switch (command) {
      case 'create-request':
        await createTestRequest();
        break;
      case 'trigger':
        await triggerProcessor();
        break;
      case 'check-status':
        await checkStatus();
        break;
      case 'check-linkedin':
        await checkLinkedIn();
        break;
      case 'reset-request':
        await resetRequest();
        break;
      default:
        log(`❌ Unknown command: ${command}`, 'red');
        log('Run with "help" to see available commands', 'yellow');
    }
  } catch (error) {
    log(`❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
  } finally {
    await mongoose.connection.close();
    log('\n✅ Database connection closed', 'green');
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
