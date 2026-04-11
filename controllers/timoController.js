const Task = require('../models/Task');
const HeraAction = require('../models/HeraAction');
const InboxEmail = require('../models/InboxEmail');

// ── A. FONCTION D'AUTOPLANIFICATION (Appelée par Hera) ──
exports.autoPlanMeeting = async (employeeName, type) => {
  try {
    const plannedDate = new Date();
    
    // ✅ STRATÉGIE DE DATE
    if (type === "Interview") {
      plannedDate.setDate(plannedDate.getDate() + 2); 
    } else if (type === "Onboarding") {
      plannedDate.setDate(plannedDate.getDate() + (5 - plannedDate.getDay() + 7) % 7);
    } else {
      plannedDate.setDate(plannedDate.getDate() + 3); 
    }

    plannedDate.setHours(14, 0, 0, 0); // Toujours à 14h

    const formattedDate = plannedDate.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });

    // 1. Création de la tâche pour le Calendrier Flutter
    await Task.create({
      title: `[${type.toUpperCase()}] : ${employeeName}`,
      description: `Planifié automatiquement par Timo IA.`,
      deadline: plannedDate,
      category: 'meeting',
      userId: 'timo_agent',
      status: 'todo'
    });

    // 2. Notification pour le Dash de Hera
    await HeraAction.create({
      action_type: 'planning_confirmed', // ✅ Nom sémantique corrigé
      details: { 
        department: "LOGISTIQUE", 
        message: `Timo a planifié l'${type} de ${employeeName} le ${formattedDate}.`,
        agent: "Timo" 
      },
      triggered_by: 'hera_auto'
    });

    return formattedDate; // On renvoie la date à Hera
  } catch (err) {
    console.error("Erreur Timo:", err);
    return "Date à définir";
  }
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