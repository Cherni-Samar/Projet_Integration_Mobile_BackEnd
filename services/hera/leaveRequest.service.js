// =============================================================
//  SERVICE - Leave Request Management
// =============================================================

const Employee = require('../../models/Employee');
const LeaveRequest = require('../../models/LeaveRequest');
const HeraAction = require('../../models/HeraAction');
const mailService = require('../../utils/emailService');

class LeaveRequestService {
  
  /**
   * Helper function to calculate days between dates
   */
  static calculateDays(start, end) {
    return Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)) + 1;
  }
  
  /**
   * Process a leave request with business logic validation
   * @param {Object} data - Leave request data
   * @param {string} data.employee_id - Employee ID
   * @param {string} data.type - Leave type (annual, sick, urgent)
   * @param {string} data.start_date - Start date
   * @param {string} data.end_date - End date
   * @param {string} data.reason - Reason for leave
   * @returns {Promise<Object>} Leave decision result
   */
  static async processLeaveRequest(data) {
    const { employee_id, type, start_date, end_date, reason } = data;
    const start = new Date(start_date);
    const end = new Date(end_date);
    const days = this.calculateDays(start, end);

    const employee = await Employee.findById(employee_id);
    const ceo_id = employee.ceo_id;
    if (!employee) {
      return { success: false, message: "Employé non trouvé." };
    }

    const remaining = (employee.leave_balance?.[type] || 0) - (employee.leave_balance_used?.[type] || 0);

    if (days > remaining) {
      const refusal_reason = `Solde insuffisant (${remaining}j restants).`;
      
      // Send refusal notification
      await mailService.sendLeaveNotification(employee.email, {
        employee_name: employee.name, 
        start_date, 
        end_date, 
        status: 'refused', 
        reason_decision: refusal_reason, 
        days
      });
      
      return { success: false, message: refusal_reason };
    }

    const simultaneousCount = await LeaveRequest.countDocuments({
      status: 'approved',
      employee_id: { $ne: employee_id },
      $or: [{ start_date: { $lte: end }, end_date: { $gte: start } }]
    });

    let status = (type === 'urgent' || simultaneousCount < 2) ? 'approved' : 'refused';
    let decision_reason = status === 'approved' ? 'Capacité OK' : `Déjà ${simultaneousCount} personnes en congé.`;

    const leave = await LeaveRequest.create({
      employee_id, 
      employee_email: employee.email, 
      type, 
      start_date: start, 
      end_date: end, 
      days, 
      reason, 
      status
    });

  await HeraAction.create({
  ceo_id,
  employee_id,
  action_type: status === 'approved' ? 'leave_approved' : 'leave_refused',
  details: { type, days, decision_reason },
  triggered_by: 'hera_auto'
});

    if (status === 'approved') {
      await Employee.findByIdAndUpdate(employee_id, { 
        $inc: { [`leave_balance_used.${type}`]: days } 
      });
    }

    // Send final notification
    await mailService.sendLeaveNotification(employee.email, {
      employee_name: employee.name, 
      start_date, 
      end_date, 
      status, 
      reason_decision: decision_reason, 
      days
    });

    return { 
      success: true, 
      status, 
      message: `Décision : ${status}. ${decision_reason}`, 
      leave 
    };
  }
  
  /**
   * Process urgent leave request (same day)
   * @param {Object} data - Leave request data
   * @returns {Promise<Object>} Leave decision result
   */
  static async processUrgentLeave(data) {
    const today = new Date().toISOString().split('T')[0];
    const urgentData = {
      ...data,
      type: 'urgent',
      start_date: today,
      end_date: today
    };
    
    return await this.processLeaveRequest(urgentData);
  }
  
  /**
   * Get leave requests for an employee
   * @param {string} employeeId - Employee ID
   * @returns {Promise<Object>} Leave requests result
   */
  static async getEmployeeLeaves(employeeId) {
    const leaves = await LeaveRequest.find({ employee_id: employeeId })
      .sort({ created_at: -1 });
    
    return { success: true, leaves };
  }
  
  /**
   * Get leave history for an employee (alias for getEmployeeLeaves)
   * @param {string} employeeId - Employee ID
   * @returns {Promise<Object>} Leave history result
   */
  static async getLeaveHistory(employeeId) {
    return await this.getEmployeeLeaves(employeeId);
  }
  
  /**
   * Get general history (HeraAction) for an employee
   * @param {string} employeeId - Employee ID
   * @returns {Promise<Object>} History result
   */
  static async getEmployeeHistory(employeeId) {
    const actions = await HeraAction.find({ employee_id: employeeId })
      .sort({ created_at: -1 });
    
    return { success: true, actions };
  }
}

module.exports = LeaveRequestService;