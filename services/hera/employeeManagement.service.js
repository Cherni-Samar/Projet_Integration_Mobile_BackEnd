// =============================================================
//  SERVICE - Employee Management (Hera)
// =============================================================

const Employee = require('../../models/Employee');
const LeaveRequest = require('../../models/LeaveRequest');

class EmployeeManagementService {
  
  /**
   * Get all employees for a CEO (excluding inactive)
   * @param {string} ceoId - CEO user ID
   * @returns {Promise<Object>} Response with employees array
   */
  static async getAllEmployees(ceoId) {
    try {
      // ✅ On ignore les 'inactive' pour ne pas polluer l'écran
      const employees = await Employee.find({
        ceo_id: ceoId,
        status: { $in: ['active', 'onboarding', 'offboarding'] },
      }).sort({ name: 1 });

      return { success: true, employees };
    } catch (error) {
      throw error; // Let controller handle the error response
    }
  }

  /**
   * Get admin dashboard statistics
   * @param {string} ceoId - CEO user ID
   * @returns {Promise<Object>} Response with statistics
   */
  static async getAdminStats(ceoId) {
    try {
      const totalEmployees = await Employee.countDocuments({
        ceo_id: ceoId,
        status: { $in: ['active', 'onboarding'] },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const employeeIds = await Employee.find({ ceo_id: ceoId }).distinct('_id');

      const onLeaveToday = await LeaveRequest.countDocuments({
        employee_id: { $in: employeeIds },
        status: 'approved',
        start_date: { $lte: tomorrow },
        end_date: { $gte: today },
      });

      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const monthlyLeaves = await LeaveRequest.aggregate([
        {
          $match: {
            employee_id: { $in: employeeIds },
            status: 'approved',
            start_date: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            totalDays: { $sum: '$days' },
          },
        },
      ]);

      return {
        success: true,
        stats: {
          total_employees: totalEmployees,
          on_leave_today: onLeaveToday,
          monthly_leave_days: monthlyLeaves[0]?.totalDays || 0,
        },
      };
    } catch (error) {
      throw error; // Let controller handle the error response
    }
  }

  /**
   * Promote an employee to a new role
   * @param {string} employeeId - Employee ID
   * @param {string} newRole - New role for the employee
   * @returns {Promise<Object>} Response with success message
   */
  static async promoteEmployee(employeeId, newRole) {
    try {
      await Employee.findByIdAndUpdate(employeeId, { role: newRole });
      return { success: true, message: "Promotion effectuée" };
    } catch (error) {
      throw error; // Let controller handle the error response
    }
  }
}

module.exports = EmployeeManagementService;