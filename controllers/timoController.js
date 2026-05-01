const Task = require('../models/Task');
const HeraAction = require('../models/HeraAction');
const InboxEmail = require('../models/InboxEmail');
const ActivityLogger = require('../services/activityLogger.service');

exports.autoPlanMeeting = async (participantName, type) => {
    let suggestedDate = new Date();
    suggestedDate.setDate(suggestedDate.getDate() + 2);
    suggestedDate.setHours(9, 0, 0, 0);

    let isFound = false;

    while (!isFound) {
        const day = suggestedDate.getDay();
        if (day === 6 || day === 0) {
            suggestedDate.setDate(suggestedDate.getDate() + 1);
            continue;
        }

        const conflict = await Task.findOne({ 
            deadline: suggestedDate,
            category: 'meeting' 
        });

        if (conflict) {
            console.log(`📅 Le créneau du ${suggestedDate.toDateString()} est complet.`);
            suggestedDate.setDate(suggestedDate.getDate() + 1);
            suggestedDate.setHours(9, 0, 0, 0);
        } else {
            isFound = true;
        }
    }

    const finalTask = await Task.create({
        title: `${type} : ${participantName}`,
        description: `Entretien planifié automatiquement par Timo.`,
        deadline: suggestedDate,
        status: 'todo',
        category: 'meeting',
        priority: 'high',
        userId: 'current_user'
    });
    
    const { manualEnergyConsumption } = require('../middleware/energyMiddleware');
    let userId = null;
    let energyConsumed = 0;
    try {
      const User = require('../models/User');
      const userWithEnergy = await User.findOne({ energyBalance: { $gt: 0 } }).sort({ energyBalance: -1 });
      if (userWithEnergy) userId = userWithEnergy._id.toString();
      const energyResult = await manualEnergyConsumption('timo', 'MEETING_SCHEDULED', `Scheduled ${type} for ${participantName}`, { participantName, meetingType: type, scheduledDate: suggestedDate, taskId: finalTask._id }, userId);
      if (energyResult.success) {
        energyConsumed = energyResult.energyCost;
        console.log(`⚡ [ENERGY] Timo consumed ${energyResult.energyCost} energy`);
      }
    } catch (err) {
      console.warn('⚠️ [TIMO] Energy error:', err.message);
    }
    
    await ActivityLogger.logTimoActivity('MEETING_SCHEDULED', `Scheduled ${type} for ${participantName}`, {
        targetAgent: 'hera', description: `Auto-planned at ${suggestedDate.toLocaleString('fr-FR')}`,
        status: 'success', energyConsumed, priority: 'high',
        metadata: { participantName, meetingType: type, scheduledDate: suggestedDate, taskId: finalTask._id }
    });

    return {
        date: suggestedDate.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
        task: finalTask
    };
};

exports.getTimoTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ category: 'meeting' });
    res.json({ success: true, tasks });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getTimoInbox = async (req, res) => {
  try {
    const emails = await InboxEmail.find({ to: "timo@e-team.com" }).sort({ receivedAt: -1 });
    res.json({ success: true, emails });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.confirmPlanning = async (req, res) => {
  res.json({ success: true, message: "Planning validé par Timo IA" });
};
