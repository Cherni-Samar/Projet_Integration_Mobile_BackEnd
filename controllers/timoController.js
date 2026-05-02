const Task = require('../models/Task');
const HeraAction = require('../models/HeraAction');
const InboxEmail = require('../models/InboxEmail');
const ActivityLogger = require('../services/shared/activityLogger.service');
const CentralizedEnergyService = require('../services/energy/centralizedEnergy.service');

// ── A. FONCTION D'AUTOPLANIFICATION (Appelée par Hera) ──
// controllers/timoController.js

exports.autoPlanMeeting = async (participantName, type) => {
    let suggestedDate = new Date();
    
    // 1. DÉLAI DE PRÉVENANCE : On commence à chercher à partir de dans 2 jours
    suggestedDate.setDate(suggestedDate.getDate() + 2);
    suggestedDate.setHours(9, 0, 0, 0); // TOUJOURS à 09h00 du matin

    let isFound = false;

    while (!isFound) {
        // 2. ÉVITER LES WEEK-ENDS
        const day = suggestedDate.getDay();
        if (day === 6 || day === 0) { // Samedi ou Dimanche
            suggestedDate.setDate(suggestedDate.getDate() + 1);
            continue; // On reteste le jour suivant
        }

        // 3. VÉRIFICATION DU CRÉNEAU UNIQUE
        // On cherche s'il y a N'IMPORTE QUEL rendez-vous ce jour-là à 09h00
        const conflict = await Task.findOne({ 
            deadline: suggestedDate,
            category: 'meeting' 
        });

        if (conflict) {
            // DÉJÀ PRIS ? On passe DIRECTEMENT au lendemain à 09h00
            console.log(`📅 Le créneau du ${suggestedDate.toDateString()} est complet. Timo reporte au lendemain...`);
            suggestedDate.setDate(suggestedDate.getDate() + 1);
            suggestedDate.setHours(9, 0, 0, 0);
        } else {
            isFound = true; // On a trouvé un jour ouvré libre à 09h00 !
        }
    }

    // 4. CRÉATION DE LA TÂCHE
    const finalTask = await Task.create({
        title: `${type} : ${participantName}`,
        description: `Entretien de haute priorité planifié automatiquement par Timo. Un seul créneau par jour autorisé pour ce type d'événement.`,
        deadline: suggestedDate,
        status: 'todo',
        category: 'meeting',
        priority: 'high',
        userId: 'current_user'
    });
    
    // ⚡ CONSUME ENERGY FOR MEETING SCHEDULING - SECURED
    let energyConsumed = 0;
    try {
      const energyResult = await CentralizedEnergyService.consumeForAutonomous({
        agentName: 'timo',
        taskType: 'MEETING_SCHEDULED',
        taskDescription: `Scheduled ${type} meeting for ${participantName}`,
        metadata: { 
          participantName,
          meetingType: type,
          scheduledDate: suggestedDate,
          taskId: finalTask._id,
          source: 'timo_controller'
        }
      });
      
      if (energyResult.success) {
        energyConsumed = energyResult.energyCost;
        console.log(`⚡ [TIMO] Energy consumed successfully: ${energyResult.energyCost} from user ${energyResult.validatedUserId}`);
      } else if (energyResult.blocked) {
        console.warn(`⛔ TIMO energy blocked: ${energyResult.securityReason || energyResult.error}`);
        // Continue with meeting scheduling even if energy is blocked
        // This preserves existing behavior where scheduling continues regardless of energy
      } else {
        console.warn(`⚠️ [TIMO] Energy consumption failed: ${energyResult.error} - Continuing with meeting scheduling`);
      }
    } catch (err) {
      console.warn('⚠️ [TIMO] Could not process energy consumption:', err.message);
    }
    
    // 📝 LOG ACTIVITY
    await ActivityLogger.logTimoActivity(
        'MEETING_SCHEDULED',
        `Scheduled ${type} meeting for ${participantName}`,
        {
            targetAgent: 'hera',
            description: `Auto-planned meeting at ${suggestedDate.toLocaleString('fr-FR')}`,
            status: 'success',
            energyConsumed: energyConsumed,
            priority: 'high',
            metadata: {
                participantName,
                meetingType: type,
                scheduledDate: suggestedDate,
                taskId: finalTask._id
            }
        }
    );

    return {
        date: suggestedDate.toLocaleString('fr-FR', { 
            weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' 
        }),
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