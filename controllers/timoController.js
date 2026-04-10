const Task = require('../models/Task');
const HeraAction = require('../models/HeraAction');
const InboxEmail = require('../models/InboxEmail');

// ── A. FONCTION D'AUTOPLANIFICATION (Appelée par Hera en interne) ──
// Dans controllers/timoController.js

exports.autoPlanMeeting = async (employeeName, type) => {
  try {
    const plannedDate = new Date();
    
    // ✅ STRATÉGIE DIFFÉRENCIÉE
    if (type === "Interview") {
      plannedDate.setDate(plannedDate.getDate() + 2); // Entretien rapide
    } else if (type === "Onboarding") {
      // On vise le vendredi suivant
      plannedDate.setDate(plannedDate.getDate() + (5 - plannedDate.getDay() + 7) % 7);
    } else {
      plannedDate.setDate(plannedDate.getDate() + 3); // Offboarding / Départ
    }

    plannedDate.setHours(14, 0, 0, 0); // Fixé à 14h

    // Enregistrement dans le calendrier (Tasks)
    await Task.create({
      title: `[${type.toUpperCase()}] : ${employeeName}`,
      deadline: plannedDate,
      category: 'meeting',
      userId: 'timo_agent'
    });

    // Notification pour le Dash de Hera
    await HeraAction.create({
      action_type: 'planning_confirmed',
      details: { 
        department: "PLANNING", 
        message: `Timo a planifié l'${type} de ${employeeName}.`,
        agent: "Timo" 
      },
      triggered_by: 'hera_auto'
    });

    return plannedDate.toLocaleDateString('fr-FR');
  } catch (err) { console.error(err); }
};

// ── B. RÉCUPÉRER LES TÂCHES (Pour le calendrier Flutter) ──
exports.getTimoTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ category: 'meeting' });
    res.json({ success: true, tasks });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── C. RÉCUPÉRER L'INBOX (Pour l'affichage Flutter) ──
exports.getTimoInbox = async (req, res) => {
  try {
    const emails = await InboxEmail.find({ to: "timo@e-team.com" }).sort({ receivedAt: -1 });
    res.json({ success: true, emails });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── D. CONFIRMER LE PLANNING (Requis par heraRoutes.js ligne 54) ──
exports.confirmPlanning = async (req, res) => {
  res.json({ success: true, message: "Action gérée par l'IA" });
};
exports.autoPlanMeeting = async (employeeName, employeeEmail, type, mode) => {
  try {
    // 1. Calcul de la date (J+3)
    const plannedDate = new Date();
    plannedDate.setDate(plannedDate.getDate() + 3);
    const formattedDate = plannedDate.toLocaleDateString('fr-FR', { 
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' 
    });

    // 2. Création de la tâche dans MongoDB (Agenda de Timo)
    const Task = require('../models/Task');
    await Task.create({
      title: `Meeting ${type}: ${employeeName}`,
      description: `Entretien ${mode} planifié par Timo.`,
      deadline: plannedDate,
      category: 'meeting',
      userId: 'timo_agent'
    });

    // 3. 🚀 DÉLÉGATION : Timo demande à Hera d'envoyer le mail final
    const mailService = require('../utils/emailService');
    await mailService.sendHeraConvocation(employeeEmail, {
      name: employeeName,
      date: formattedDate,
      type: type,
      mode: mode
    });

    return formattedDate;
  } catch (err) {
    console.error("❌ Erreur dans l'auto-planning de Timo:", err.message);
  }
};