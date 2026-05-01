const HeraAction = require('./models/HeraAction');

// ═══════════════════════════════════════════════════════════════
// 🤖 HELPERS POUR CRÉER DES INTERACTIONS INTER-AGENTS
// ═══════════════════════════════════════════════════════════════

class AgentInteractionHelper {
  
  /**
   * Crée une interaction Hera → Echo pour le recrutement
   */
  static async createRecruitmentAlert(data) {
    return await HeraAction.createInteraction({
      type: 'recruitment_request',
      sender: 'hera',
      receiver: 'echo',
      details: {
        department: data.department,
        position: data.position,
        urgency: data.urgency || 'normal',
        requirements: data.requirements,
        subject: `Recruitment Alert: ${data.position} needed in ${data.department}`
      },
      priority: data.urgency === 'urgent' ? 'urgent' : 'normal',
      employee_id: data.employee_id
    });
  }

  /**
   * Crée une interaction Echo → Hera pour confirmation de post
   */
  static async createSocialPostConfirmation(data) {
    return await HeraAction.createInteraction({
      type: 'social_post_created',
      sender: 'echo',
      receiver: 'hera',
      details: {
        platform: data.platform || 'LinkedIn',
        postId: data.postId,
        content: data.content,
        position: data.position,
        department: data.department,
        subject: `Social Post Created: Job posting for ${data.position}`
      },
      correlation_id: data.recruitment_id // Lier à la demande de recrutement
    });
  }

  /**
   * Crée une interaction Hera → Timo pour planification
   */
  static async createScheduleRequest(data) {
    return await HeraAction.createInteraction({
      type: 'schedule_created',
      sender: 'hera',
      receiver: 'timo',
      details: {
        eventType: data.eventType, // 'interview', 'meeting', 'onboarding'
        title: data.title,
        participants: data.participants,
        datetime: data.datetime,
        duration: data.duration,
        location: data.location,
        subject: `Schedule Request: ${data.title}`
      },
      employee_id: data.employee_id,
      priority: data.urgent ? 'urgent' : 'normal'
    });
  }

  /**
   * Crée une interaction Dexo → Hera pour génération de document
   */
  static async createDocumentGeneration(data) {
    return await HeraAction.createInteraction({
      type: data.documentType === 'contract' ? 'contract_generated' : 'attestation_generated',
      sender: 'dexo',
      receiver: 'hera',
      details: {
        documentType: data.documentType,
        fileName: data.fileName,
        employeeName: data.employeeName,
        position: data.position,
        filePath: data.filePath,
        subject: `Document Generated: ${data.documentType} for ${data.employeeName}`
      },
      employee_id: data.employee_id,
      interaction_metadata: {
        encrypted: true, // Documents sont toujours chiffrés
        auto_generated: true
      }
    });
  }

  /**
   * Crée une interaction Kash → Dexo pour traitement de paie
   */
  static async createPayrollProcessing(data) {
    return await HeraAction.createInteraction({
      type: 'payroll_processed',
      sender: 'kash',
      receiver: 'dexo',
      details: {
        period: data.period,
        employeeCount: data.employeeCount,
        totalAmount: data.totalAmount,
        currency: data.currency || 'EUR',
        subject: `Payroll Processed: ${data.period} - ${data.employeeCount} employees`
      },
      interaction_metadata: {
        encrypted: true, // Données financières chiffrées
        auto_generated: true
      }
    });
  }

  /**
   * Crée une interaction Timo → Hera pour confirmation de tâche
   */
  static async createTaskAssignment(data) {
    return await HeraAction.createInteraction({
      type: 'task_created',
      sender: 'timo',
      receiver: 'hera',
      details: {
        taskType: data.taskType,
        title: data.title,
        description: data.description,
        assignee: data.assignee,
        deadline: data.deadline,
        priority: data.priority,
        subject: `Task Assigned: ${data.title}`
      },
      employee_id: data.employee_id,
      priority: data.priority || 'normal'
    });
  }

  /**
   * Crée une notification système générique
   */
  static async createSystemNotification(data) {
    return await HeraAction.createInteraction({
      type: 'notification_sent',
      sender: data.sender || 'hera',
      receiver: data.receiver || 'echo',
      details: {
        notificationType: data.type,
        message: data.message,
        subject: data.subject,
        metadata: data.metadata || {}
      },
      priority: data.priority || 'normal',
      employee_id: data.employee_id
    });
  }

  /**
   * Crée une alerte système
   */
  static async createSystemAlert(data) {
    return await HeraAction.createInteraction({
      type: 'alert_triggered',
      sender: 'hera',
      receiver: data.receiver || 'echo',
      details: {
        alertType: data.alertType,
        severity: data.severity || 'medium',
        message: data.message,
        actionRequired: data.actionRequired || false,
        subject: `System Alert: ${data.alertType}`
      },
      priority: data.severity === 'high' ? 'urgent' : 'normal'
    });
  }

  /**
   * Récupère les statistiques d'interactions
   */
  static async getInteractionStats(timeframe = '24h') {
    const now = new Date();
    let startDate;

    switch (timeframe) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const interactions = await HeraAction.find({
      type: {
        $in: [
          'email_sent', 'document_generated', 'task_created',
          'notification_sent', 'alert_triggered', 'recruitment_request',
          'schedule_created', 'payroll_processed', 'social_post_created',
          'interview_scheduled', 'contract_generated', 'attestation_generated'
        ]
      },
      createdAt: { $gte: startDate }
    });

    const stats = {
      total: interactions.length,
      successful: interactions.filter(i => i.status === 'completed').length,
      pending: interactions.filter(i => i.status === 'pending' || i.status === 'processing').length,
      failed: interactions.filter(i => i.status === 'failed').length,
      encrypted: interactions.filter(i => i.interaction_metadata?.encrypted === true).length,
      byAgent: {}
    };

    // Statistiques par agent
    ['hera', 'echo', 'timo', 'dexo', 'kash'].forEach(agent => {
      stats.byAgent[agent] = {
        sent: interactions.filter(i => i.sender_agent === agent).length,
        received: interactions.filter(i => i.receiver_agent === agent).length
      };
    });

    return stats;
  }

  /**
   * Récupère les interactions récentes avec pagination
   */
  static async getRecentInteractions(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    
    const interactions = await HeraAction.find({
      type: {
        $in: [
          'email_sent', 'document_generated', 'task_created',
          'notification_sent', 'alert_triggered', 'recruitment_request',
          'schedule_created', 'payroll_processed', 'social_post_created',
          'interview_scheduled', 'contract_generated', 'attestation_generated'
        ]
      }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('employee_id', 'name email position')
    .lean();

    const total = await HeraAction.countDocuments({
      type: {
        $in: [
          'email_sent', 'document_generated', 'task_created',
          'notification_sent', 'alert_triggered', 'recruitment_request',
          'schedule_created', 'payroll_processed', 'social_post_created',
          'interview_scheduled', 'contract_generated', 'attestation_generated'
        ]
      }
    });

    return {
      interactions,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_items: total,
        items_per_page: limit
      }
    };
  }
}

module.exports = AgentInteractionHelper;