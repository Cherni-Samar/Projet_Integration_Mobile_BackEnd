/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HERA ACTION PROCESSOR SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Autonomous processor for HeraAction documents
 * Handles: Recruitment request orchestration with Kash budget validation
 * 
 * Flow:
 * 1. Find pending hr_request actions
 * 2. Validate budget with Kash
 * 3. Update status based on Kash response
 * 4. Log all steps for debugging
 * 
 * Author: Backend Team
 * Created: 2026-05-04
 * ═══════════════════════════════════════════════════════════════════════════
 */

const HeraAction = require('../../models/HeraAction');
const Budget = require('../../models/Budget');
const Employee = require('../../models/Employee');
const User = require('../../models/User');
const linkedinService = require('../echo/linkedin.service');
const { getRecruitmentFormUrl } = require('../../utils/recruitmentFormUrl');

class HeraActionProcessor {
  
  /**
   * Main entry point - Process all pending recruitment requests
   * Called by cron job every 2 minutes
   */
  static async processRecruitmentRequests() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('[HERA PROCESSOR] 🚀 Starting recruitment request processing...');
    console.log('═══════════════════════════════════════════════════════════');
    
    try {
      // Find all pending hr_request actions
      const pendingActions = await HeraAction.find({
        action_type: 'hr_request',
        'details.type': 'recruitment',
        'details.status': 'pending_analysis'
      })
      .populate('ceo_id', 'email name')
      .populate('employee_id', 'name email department')
      .lean();

      if (pendingActions.length === 0) {
        console.log('[HERA PROCESSOR] ℹ️  No pending recruitment requests found');
        console.log('═══════════════════════════════════════════════════════════\n');
        return {
          success: true,
          processed: 0,
          message: 'No pending requests'
        };
      }

      console.log(`[HERA PROCESSOR] 📋 Found ${pendingActions.length} pending request(s)`);
      
      const results = [];
      
      // Process each action sequentially to avoid race conditions
      for (const action of pendingActions) {
        try {
          console.log(`\n[HERA PROCESSOR] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`[HERA PROCESSOR] 📄 Processing HeraAction ID: ${action._id}`);
          console.log(`[HERA PROCESSOR] 👤 Manager: ${action.employee_id?.name || 'Unknown'}`);
          console.log(`[HERA PROCESSOR] 🏢 Department: ${action.details.department}`);
          console.log(`[HERA PROCESSOR] 💼 Role: ${action.details.role}`);
          
          const result = await this.processSingleRecruitmentRequest(action);
          results.push(result);
          
          console.log(`[HERA PROCESSOR] ✅ Completed processing for ${action._id}`);
          
        } catch (error) {
          console.error(`[HERA PROCESSOR] ❌ Error processing action ${action._id}:`, error.message);
          results.push({
            actionId: action._id,
            success: false,
            error: error.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log(`[HERA PROCESSOR] 📊 Processing Summary:`);
      console.log(`[HERA PROCESSOR]    ✅ Success: ${successCount}`);
      console.log(`[HERA PROCESSOR]    ❌ Failed: ${failCount}`);
      console.log(`[HERA PROCESSOR]    📋 Total: ${results.length}`);
      console.log('═══════════════════════════════════════════════════════════\n');
      
      return {
        success: true,
        processed: results.length,
        successCount,
        failCount,
        results
      };
      
    } catch (error) {
      console.error('[HERA PROCESSOR] ❌ Fatal error in processRecruitmentRequests:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process a single recruitment request
   * @param {Object} action - HeraAction document (lean)
   */
  static async processSingleRecruitmentRequest(action) {
    const actionId = action._id;
    const ceoId = action.ceo_id._id || action.ceo_id;
    
    try {
      // Step 1: Update status to "budget_checking"
      console.log(`[HERA PROCESSOR] 🔄 Step 1: Updating status to "budget_checking"...`);
      
      await HeraAction.findByIdAndUpdate(actionId, {
        'details.status': 'budget_checking',
        'details.budget_check_started_at': new Date()
      });
      
      console.log(`[HERA PROCESSOR] ✅ Status updated to "budget_checking"`);
      
      // Step 2: Call Kash budget validation
      console.log(`[HERA PROCESSOR] 💰 Step 2: Calling Kash for budget validation...`);
      
      const budgetValidation = await this.validateBudgetWithKash(ceoId, action.details);
      
      console.log(`[HERA PROCESSOR] 📊 Kash response:`, JSON.stringify(budgetValidation, null, 2));
      
      // Step 3: Update status based on Kash response
      if (budgetValidation.canAfford) {
        console.log(`[HERA PROCESSOR] ✅ Step 3: Budget APPROVED - Updating status...`);
        
        await HeraAction.findByIdAndUpdate(actionId, {
          'details.status': 'budget_approved',
          'details.budget_check_completed_at': new Date(),
          'details.kash_validation': {
            canAfford: true,
            remaining_budget: budgetValidation.remainingBudget,
            total_cost: budgetValidation.totalCost,
            validated_at: new Date()
          }
        });
        
        console.log(`[HERA PROCESSOR] ✅ Status updated to "budget_approved"`);
        console.log(`[HERA PROCESSOR] 💵 Remaining budget: ${budgetValidation.remainingBudget} ${budgetValidation.currency}`);
        
        // Step 4: Post to LinkedIn via Echo
        console.log(`[HERA PROCESSOR] 📱 Step 4: Posting recruitment to LinkedIn via Echo...`);
        
        const linkedinResult = await this.postRecruitmentToLinkedIn(actionId, action.details);
        
        return {
          actionId,
          success: true,
          status: linkedinResult.status,
          message: linkedinResult.message,
          budgetValidation,
          linkedinPosting: linkedinResult
        };
        
      } else {
        console.log(`[HERA PROCESSOR] ❌ Step 3: Budget REJECTED - Updating status...`);
        
        await HeraAction.findByIdAndUpdate(actionId, {
          'details.status': 'budget_rejected',
          'details.budget_check_completed_at': new Date(),
          'details.kash_validation': {
            canAfford: false,
            reason: budgetValidation.reason,
            shortfall: budgetValidation.shortfall,
            validated_at: new Date()
          }
        });
        
        console.log(`[HERA PROCESSOR] ❌ Status updated to "budget_rejected"`);
        console.log(`[HERA PROCESSOR] 💸 Reason: ${budgetValidation.reason}`);
        
        return {
          actionId,
          success: true,
          status: 'budget_rejected',
          message: 'Budget rejected by Kash',
          budgetValidation
        };
      }
      
    } catch (error) {
      console.error(`[HERA PROCESSOR] ❌ Error in processSingleRecruitmentRequest:`, error);
      
      // Update status to error state
      try {
        await HeraAction.findByIdAndUpdate(actionId, {
          'details.status': 'processing_error',
          'details.error': error.message,
          'details.error_at': new Date()
        });
      } catch (updateError) {
        console.error(`[HERA PROCESSOR] ❌ Failed to update error status:`, updateError.message);
      }
      
      throw error;
    }
  }

  /**
   * Validate budget with Kash
   * Reuses existing Kash budget validation logic
   * 
   * @param {String} ceoId - CEO/User ID
   * @param {Object} details - Recruitment request details
   * @returns {Object} Budget validation result
   */
  static async validateBudgetWithKash(ceoId, details) {
    console.log(`[HERA PROCESSOR] 🔍 Validating budget for CEO: ${ceoId}`);
    
    try {
      // Extract recruitment details
      const {
        salary_budget,
        headcount = 1,
        department,
        role,
        contract_type
      } = details;
      
      // Calculate total cost
      const salaryPerPerson = parseFloat(salary_budget) || 0;
      const numberOfPeople = parseInt(headcount) || 1;
      const totalCost = salaryPerPerson * numberOfPeople;
      
      console.log(`[HERA PROCESSOR] 💵 Salary per person: ${salaryPerPerson}`);
      console.log(`[HERA PROCESSOR] 👥 Number of people: ${numberOfPeople}`);
      console.log(`[HERA PROCESSOR] 💰 Total cost: ${totalCost}`);
      
      if (totalCost <= 0) {
        console.log(`[HERA PROCESSOR] ⚠️  Warning: Total cost is 0 or negative`);
        return {
          canAfford: false,
          reason: 'Invalid salary budget (must be > 0)',
          totalCost: 0,
          remainingBudget: 0,
          currency: 'TND'
        };
      }
      
      // Find Salaries budget for this CEO
      console.log(`[HERA PROCESSOR] 🔍 Looking for Salaries budget...`);
      
      const salariesBudget = await Budget.findOne({
        managerId: ceoId,
        category: 'Salaries',
        isActive: true
      }).lean();
      
      if (!salariesBudget) {
        console.log(`[HERA PROCESSOR] ❌ No Salaries budget found for CEO ${ceoId}`);
        return {
          canAfford: false,
          reason: 'No Salaries budget configured',
          totalCost,
          remainingBudget: 0,
          currency: 'TND'
        };
      }
      
      console.log(`[HERA PROCESSOR] ✅ Found Salaries budget:`);
      console.log(`[HERA PROCESSOR]    Limit: ${salariesBudget.limit} ${salariesBudget.currency}`);
      console.log(`[HERA PROCESSOR]    Spent: ${salariesBudget.spent} ${salariesBudget.currency}`);
      
      // Calculate remaining budget
      const remainingBudget = salariesBudget.limit - salariesBudget.spent;
      
      console.log(`[HERA PROCESSOR]    Remaining: ${remainingBudget} ${salariesBudget.currency}`);
      
      // Check if organization can afford
      const canAfford = remainingBudget >= totalCost;
      
      if (canAfford) {
        console.log(`[HERA PROCESSOR] ✅ Budget validation: APPROVED`);
        console.log(`[HERA PROCESSOR]    Can afford ${totalCost} ${salariesBudget.currency}`);
        console.log(`[HERA PROCESSOR]    Remaining after hire: ${remainingBudget - totalCost} ${salariesBudget.currency}`);
        
        return {
          canAfford: true,
          totalCost,
          remainingBudget,
          remainingAfterHire: remainingBudget - totalCost,
          currency: salariesBudget.currency,
          budgetLimit: salariesBudget.limit,
          currentSpent: salariesBudget.spent,
          department,
          role,
          headcount: numberOfPeople
        };
      } else {
        const shortfall = totalCost - remainingBudget;
        
        console.log(`[HERA PROCESSOR] ❌ Budget validation: REJECTED`);
        console.log(`[HERA PROCESSOR]    Shortfall: ${shortfall} ${salariesBudget.currency}`);
        
        return {
          canAfford: false,
          reason: `Budget insuffisant (manque ${shortfall.toFixed(2)} ${salariesBudget.currency})`,
          totalCost,
          remainingBudget,
          shortfall,
          currency: salariesBudget.currency,
          budgetLimit: salariesBudget.limit,
          currentSpent: salariesBudget.spent,
          department,
          role,
          headcount: numberOfPeople
        };
      }
      
    } catch (error) {
      console.error(`[HERA PROCESSOR] ❌ Error in validateBudgetWithKash:`, error);
      throw new Error(`Budget validation failed: ${error.message}`);
    }
  }

  /**
   * Post recruitment request to LinkedIn via Echo
   * Called after Kash approves the budget
   * 
   * @param {String} actionId - HeraAction ID
   * @param {Object} details - Recruitment request details
   * @returns {Object} LinkedIn posting result
   */
  static async postRecruitmentToLinkedIn(actionId, details) {
    try {
      // Update status to "posting_to_linkedin"
      await HeraAction.findByIdAndUpdate(actionId, {
        'details.status': 'posting_to_linkedin',
        'details.linkedin_posting_started_at': new Date()
      });
      
      console.log(`[HERA PROCESSOR] 🔄 Status updated to "posting_to_linkedin"`);
      
      // Extract recruitment details
      const {
        role,
        department,
        contract_type,
        headcount = 1,
        level,
        skills = [],
        reason
      } = details;
      
      // Build LinkedIn post content
      const linkedinPostContent = this.buildLinkedInPostContent({
        role,
        department,
        contract_type,
        headcount,
        level,
        skills,
        reason
      });
      
      console.log(`[HERA PROCESSOR] 📝 LinkedIn post content prepared:`);
      console.log(`[HERA PROCESSOR]    Length: ${linkedinPostContent.length} characters`);
      console.log(`[HERA PROCESSOR]    Preview: ${linkedinPostContent.substring(0, 100)}...`);
      
      // Call Echo's LinkedIn service
      console.log(`[HERA PROCESSOR] 🚀 Calling LinkedIn API...`);
      const publishResult = await linkedinService.post(linkedinPostContent);
      
      if (publishResult && publishResult.success) {
        // Success - update status to "posted"
        console.log(`[HERA PROCESSOR] ✅ LinkedIn posting SUCCESS`);
        console.log(`[HERA PROCESSOR]    Post ID: ${publishResult.postId || 'N/A'}`);
        
        await HeraAction.findByIdAndUpdate(actionId, {
          'details.status': 'posted',
          'details.echo_posting': {
            posted_at: new Date(),
            post_id: publishResult.postId || null,
            response: publishResult,
            content: linkedinPostContent
          }
        });
        
        console.log(`[HERA PROCESSOR] ✅ Status updated to "posted"`);
        
        return {
          success: true,
          status: 'posted',
          message: 'Successfully posted to LinkedIn',
          postId: publishResult.postId,
          content: linkedinPostContent
        };
        
      } else {
        // Failure - update status to "posting_failed"
        console.error(`[HERA PROCESSOR] ❌ LinkedIn posting FAILED`);
        console.error(`[HERA PROCESSOR]    Error: ${publishResult?.error || 'Unknown error'}`);
        
        await HeraAction.findByIdAndUpdate(actionId, {
          'details.status': 'posting_failed',
          'details.echo_posting': {
            failed_at: new Date(),
            error: publishResult?.error || 'Unknown error',
            response: publishResult,
            content: linkedinPostContent
          }
        });
        
        console.log(`[HERA PROCESSOR] ⚠️  Status updated to "posting_failed"`);
        
        return {
          success: false,
          status: 'posting_failed',
          message: 'Failed to post to LinkedIn',
          error: publishResult?.error || 'Unknown error',
          content: linkedinPostContent
        };
      }
      
    } catch (error) {
      console.error(`[HERA PROCESSOR] ❌ Error in postRecruitmentToLinkedIn:`, error);
      
      // Update status to "posting_failed" with error details
      try {
        await HeraAction.findByIdAndUpdate(actionId, {
          'details.status': 'posting_failed',
          'details.echo_posting': {
            failed_at: new Date(),
            error: error.message,
            stack: error.stack
          }
        });
      } catch (updateError) {
        console.error(`[HERA PROCESSOR] ❌ Failed to update posting_failed status:`, updateError.message);
      }
      
      // Return error but don't crash the server
      return {
        success: false,
        status: 'posting_failed',
        message: 'Exception during LinkedIn posting',
        error: error.message
      };
    }
  }

  /**
   * Build LinkedIn post content from recruitment details
   * Reuses Echo's posting format for consistency
   * 
   * @param {Object} details - Recruitment details
   * @returns {String} LinkedIn post content
   */
  static buildLinkedInPostContent(details) {
    const {
      role,
      department,
      contract_type,
      headcount = 1,
      level,
      skills = [],
      reason,
      location
    } = details;
    
    // Build skills list
    const skillsList = Array.isArray(skills) && skills.length > 0
      ? skills.join(', ')
      : 'Polyvalence, Adaptabilité';
    
    // Build position count text
    const positionText = headcount > 1 
      ? `${headcount} positions` 
      : '1 position';
    
    // Build level text
    const levelText = level ? ` (${level})` : '';
    
    // Build contract type text
    const contractText = contract_type ? ` - ${contract_type}` : '';
    
    // Build reason text (optional)
    const reasonText = reason ? `\n💡 Context: ${reason}` : '';
    
    // Get location (use details.location or default to Tunis, Tunisia)
    const locationText = location || 'Tunis, Tunisia';
    
    // Get application URL using the recruitment form URL utility
    const applicationUrl = getRecruitmentFormUrl();
    
    console.log(`[HERA PROCESSOR] 🔗 Application URL: ${applicationUrl}`);
    console.log(`[HERA PROCESSOR] 📍 Location: ${locationText}`);
    
    // Compose the LinkedIn post
    const post = `🚀 We're Hiring at E-Team!

Our AI-driven ecosystem is expanding. We're looking for talented professionals to join our ${department} team.

📍 Location: ${locationText}
💼 Role: ${role}${levelText}
🏢 Department: ${department}
📊 Positions: ${positionText}${contractText}
🛠 Skills: ${skillsList}${reasonText}

📩 Apply here: ${applicationUrl}

Interested? Let's talk! 💼

#Hiring #AI #Innovation #${department} #ETeam #Recruitment`;
    
    return post;
  }

  /**
   * Get processing statistics
   * Useful for monitoring and debugging
   */
  static async getProcessingStats() {
    try {
      const stats = await HeraAction.aggregate([
        {
          $match: {
            action_type: 'hr_request',
            'details.type': 'recruitment'
          }
        },
        {
          $group: {
            _id: '$details.status',
            count: { $sum: 1 }
          }
        }
      ]);
      
      const statsMap = {};
      stats.forEach(s => {
        statsMap[s._id || 'unknown'] = s.count;
      });
      
      return {
        success: true,
        stats: statsMap,
        total: stats.reduce((sum, s) => sum + s.count, 0)
      };
      
    } catch (error) {
      console.error('[HERA PROCESSOR] Error getting stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Manual trigger for testing
   * Can be called from a test endpoint
   */
  static async manualTrigger() {
    console.log('[HERA PROCESSOR] 🔧 Manual trigger initiated');
    return await this.processRecruitmentRequests();
  }
}

module.exports = HeraActionProcessor;
