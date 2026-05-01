<<<<<<< HEAD
const Task = require('../models/Task');
const HeraAction = require('../models/HeraAction');
const InboxEmail = require('../models/InboxEmail');
const ActivityLogger = require('../services/activityLogger.service');

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
    
    // ⚡ CONSUME ENERGY FOR MEETING SCHEDULING
    const { manualEnergyConsumption } = require('../middleware/energyMiddleware');
    
    // Find user with most energy for energy deduction
    let userId = null;
    let energyConsumed = 0;
    try {
      const User = require('../models/User');
      const userWithEnergy = await User.findOne({ energyBalance: { $gt: 0 } }).sort({ energyBalance: -1 });
      if (userWithEnergy) {
        userId = userWithEnergy._id.toString();
        console.log(`⚡ [TIMO] Using user portfolio for energy: ${userId} (${userWithEnergy.energyBalance} energy)`);
      }
      
      const energyResult = await manualEnergyConsumption(
        'timo',
        'MEETING_SCHEDULED',
        `Scheduled ${type} meeting for ${participantName}`,
        { 
          participantName,
          meetingType: type,
          scheduledDate: suggestedDate,
          taskId: finalTask._id
        },
        userId // Pass userId for user portfolio deduction
      );
      
      if (energyResult.success) {
        energyConsumed = energyResult.energyCost;
        console.log(`⚡ [ENERGY] Timo consumed ${energyResult.energyCost} energy for MEETING_SCHEDULED`);
      } else {
        console.warn(`⚠️ [ENERGY] ${energyResult.error} - Continuing with meeting scheduling`);
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
=======
// =============================================================
//  CONTROLLER - Agent Timo (Planification / Scheduling)
// =============================================================

/**
 * Calcule automatiquement le prochain créneau disponible pour un meeting.
 * Utilisé par Héra pour planifier :
 *   - Entretiens d'embauche (Interview)
 *   - Sessions d'onboarding (Onboarding)
 *   - Entretiens de départ (Départ)
 *
 * @param {string} employeeName - Nom de l'employé/candidat
 * @param {string} meetingType  - Type : "Interview" | "Onboarding" | "Départ"
 * @returns {Promise<{date: string, type: string, employee: string}>}
 */
async function autoPlanMeeting(employeeName, meetingType = "Interview") {
  // Règles de planification par type
  const rules = {
    Interview: {
      dayOfWeek: 3,   // Mercredi
      hour: 10,
      minute: 0,
      label: "Entretien individuel",
    },
    Onboarding: {
      dayOfWeek: 5,   // Vendredi
      hour: 14,
      minute: 0,
      label: "Discovery Session (Onboarding)",
    },
    "Départ": {
      dayOfWeek: 4,   // Jeudi
      hour: 11,
      minute: 0,
      label: "Entretien de départ",
    },
  };

  const rule = rules[meetingType] || rules.Interview;

  // Calculer le prochain jour correspondant
  const now = new Date();
  const nextDate = new Date();
  const daysUntil = (rule.dayOfWeek - now.getDay() + 7) % 7 || 7; // au moins 1 jour d'avance
  nextDate.setDate(now.getDate() + daysUntil);
  nextDate.setHours(rule.hour, rule.minute, 0, 0);

  const formattedDate = nextDate.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  console.log(`📅 [TIMO] ${rule.label} planifié pour ${employeeName} le ${formattedDate}`);

  return {
    date: formattedDate,
    type: meetingType,
    employee: employeeName,
  };
}

module.exports = { autoPlanMeeting };
>>>>>>> 640174d (fix: formulaire candidature + emails + ngrok cleanup)
