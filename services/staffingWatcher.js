const cron = require('node-cron');
const Employee = require('../models/Employee');
const HeraAction = require('../models/HeraAction');
const InboxEmail = require('../models/InboxEmail'); // ✅ IMPORT DU MODÈLE DES MAILS
const mailService = require('../utils/emailService');

const DEPARTMENT_LIMITS = {
  Tech: { max: 20 }, Design: { max: 10 }, Marketing: { max: 15 },
  RH: { max: 5 }, Finance: { max: 8 }, Support: { max: 12 }
};

const watchStaffing = async () => {
  console.log("🕵️ Hera : Analyse autonome du staffing...");

  for (const [dept, config] of Object.entries(DEPARTMENT_LIMITS)) {
    const count = await Employee.countDocuments({ department: dept, status: 'active' });

    if (count < config.max * 0.8) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const alreadyNotified = await HeraAction.findOne({
        action_type: 'absence_alert',
        'details.department': dept,
        created_at: { $gte: today }
      });

      if (!alreadyNotified) {
        const mailContent = `Besoin urgent de recrutement en ${dept}. L'effectif est à ${count}/${config.max}. Merci de lancer une campagne de communication.`;
        const subject = `📢 ALERTE RECRUTEMENT : ${dept}`;

        // 1. Envoyer le vrai mail (SMTP)
        await mailService.sendStaffingAlert("echo-agent@e-team.com", {
          department: dept,
          count: count,
          max: config.max,
          message: mailContent
        });

        // 2. ✅ ENREGISTRER DANS LA TABLE 'emails' POUR ECHO
        // C'est ici que Echo "reçoit" techniquement le message dans son interface
        await InboxEmail.create({
          subject: subject,
          sender: "hera@e-team.com", // L'expéditeur est Hera
          to: "echo@e-team.com",     // Le destinataire est Echo
          content: mailContent,
          priority: 'high',          // Priorité haute car manque de staff
          isUrgent: true,
          category: 'recruitment',
          source: 'receive',         // Marqué comme reçu
          isRead: false
        });

        // 3. Enregistrer l'action Hera (pour le Dash de Hera)
        await HeraAction.create({
          action_type: 'absence_alert',
          details: { department: dept, message: mailContent },
          triggered_by: 'hera_auto'
        });

        console.log(`✅ Message envoyé et enregistré pour Echo concernant le département ${dept}`);
      }
    }
  }
};

// Se lance toutes les 30 minutes
cron.schedule('*/30 * * * *', watchStaffing);

module.exports = { watchStaffing };