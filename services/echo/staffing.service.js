// services/echo/staffing.service.js
//
// Echo Staffing Service — handles the full pipeline triggered when Hera
// sends a staffing alert to Echo.
//
// Responsibilities:
//   - Resolve department skills from the DEPARTMENT_SKILLS map
//   - Create a JobOffer record in the database
//   - Build the LinkedIn recruitment post text
//   - Publish the post to LinkedIn
//   - Consume energy for the ABSENCE_ALERT task
//   - Log the activity via ActivityLogger
//   - Create an EmailReply audit record (if emailId provided)
//   - Create an InboxEmail confirmation message in Hera's inbox
//
// Does NOT handle:
//   - HTTP request/response (stays in echoController.js)
//   - Input validation (stays in echoController.js)
//   - Other Echo features (email analysis, tasks, campaigns, etc.)

const JobOffer = require('../../models/JobOffer');
const InboxEmail = require('../../models/InboxEmail');
const EmailReply = require('../../models/EmailReply');
const linkedinService = require('../linkedin.service');
const { manualEnergyConsumption } = require('../../middleware/energyMiddleware');
const ActivityLogger = require('../activityLogger.service');

// ─── Department skills map ────────────────────────────────────────────────────
// Defines the speciality label and required hard skills for each department.
// Used to build job offer titles, descriptions, and LinkedIn post content.
const DEPARTMENT_SKILLS = {
  Tech:      { specialite: 'Développement logiciel & IA', hardSkills: ['JavaScript/Node.js', 'React/React Native', 'Python', 'MongoDB'] },
  Design:    { specialite: 'Design UX/UI', hardSkills: ['Figma', 'Adobe XD', 'Prototypage'] },
  Marketing: { specialite: 'Marketing Digital', hardSkills: ['SEO/SEM', 'Google Analytics', 'Social Media Ads'] },
  RH:        { specialite: 'Ressources Humaines', hardSkills: ['Gestion des talents', 'Droit du travail'] },
  Finance:   { specialite: 'Finance & Comptabilité', hardSkills: ['Analyse financière', 'Excel avancé'] },
  Support:   { specialite: 'Support Client', hardSkills: ['CRM (Zendesk)', 'Ticketing'] },
};

/**
 * Process a staffing alert received from Hera.
 *
 * Pipeline:
 *   0. Resolve department info from DEPARTMENT_SKILLS
 *   1. Create a JobOffer record in the database
 *   2. Build and publish the LinkedIn recruitment post
 *   3. Consume energy for the ABSENCE_ALERT task
 *   4. Log the activity
 *   5. Create an EmailReply audit record (only if emailId is provided)
 *   6. Create an InboxEmail confirmation in Hera's inbox
 *
 * @param {object} params
 * @param {string}  params.department    - Department name (e.g. 'Tech', 'Design')
 * @param {number}  [params.currentCount]  - Current headcount (used if shortage not provided)
 * @param {number}  [params.maxCapacity]   - Target headcount (used if shortage not provided)
 * @param {number}  [params.shortage]      - Explicit number of positions needed
 * @param {string}  [params.emailId]       - ID of the originating Hera email (for reply linkage)
 * @param {string}  [params.userId]        - User ID for energy attribution
 *
 * @returns {Promise<{ jobOfferId: string, linkedinPost: string }>}
 * @throws  {Error} if LinkedIn publication fails
 */
async function processStaffingAlert({ department, currentCount, maxCapacity, shortage, emailId, userId }) {
  // ── 0. Resolve department info ────────────────────────────────────────────
  const postes = shortage || (maxCapacity - currentCount);

  const deptInfo = DEPARTMENT_SKILLS[department] || { specialite: department, hardSkills: ['Polyvalence'] };
  const jobDescription = `Poste en ${deptInfo.specialite}. Skills: ${deptInfo.hardSkills.join(', ')}.`;

  // ── 1. Create JobOffer in DB ──────────────────────────────────────────────
  const jobOffer = await JobOffer.create({
    document_type: 'opening',
    title: `${deptInfo.specialite} — ${postes} poste(s)`,
    department: department,
    description: jobDescription,
    status: 'open',
  });

  // ── 2. Build LinkedIn post text ───────────────────────────────────────────
  const publicBase = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const recruitmentFormUrl = `${publicBase}/form?department=${encodeURIComponent(department)}&job_offer_id=${jobOffer._id}`;

  const linkedinPostText = `The future of work is agentic. E-Team is scaling. 🚀\n\nOur AI-driven ecosystem is looking for a ${deptInfo.specialite} to join the team.\n\n📍 Role: ${deptInfo.specialite}\n🛠 Skills: ${deptInfo.hardSkills.join(', ')}\n\n📩 Apply here: ${recruitmentFormUrl}\n\n#AI #Innovation #Recrutement #ETeam`;

  // ── 3. Publish to LinkedIn ────────────────────────────────────────────────
  const publishResult = await linkedinService.post(linkedinPostText);

  if (!publishResult || publishResult.success === false) {
    console.error("❌ LinkedIn POST FAILED:", publishResult);
    // Throw so the controller's catch block returns a 500 with the details
    const err = new Error("LinkedIn publication failed");
    err.linkedinDetails = publishResult;
    throw err;
  }

  console.log("🔍 LinkedIn result:", publishResult);

  // ── 4. Consume energy for ABSENCE_ALERT ──────────────────────────────────
  const energyResult = await manualEnergyConsumption(
    'echo',
    'ABSENCE_ALERT',
    `Processing staffing alert for ${department}`,
    { department, postes, emailId },
    userId
  );

  if (!energyResult.success) {
    console.log(`⚠️ [ENERGY] ${energyResult.error}`);
  } else {
    console.log(`⚡ [ENERGY] Echo consumed ${energyResult.energyCost} energy for ABSENCE_ALERT`);
  }

  // ── 5. Log activity ───────────────────────────────────────────────────────
  await ActivityLogger.logEchoActivity(
    'STAFFING_ALERT',
    `Processed staffing alert for ${department} department`,
    {
      targetAgent: 'hera',
      description: `Created job posting for ${postes} position(s) in ${department}`,
      status: 'success',
      energyConsumed: energyResult.success ? energyResult.energyCost : 0,
      priority: 'high',
      metadata: {
        department,
        postes,
        emailId,
        jobOfferId: jobOffer._id,
        linkedinPostId: publishResult.postId
      }
    }
  );

  // ── 6. Create EmailReply audit record (only if emailId provided) ──────────
  if (emailId) {
    try {
      await EmailReply.create({
        emailId: emailId, // Liaison avec l'ID du mail de Hera
        replyContent: `Bonjour Hera, j'ai traité ton alerte. L'offre pour ${department} est en ligne. ID LinkedIn: ${publishResult.postId || 'Simulé'}.`,
        sentBy: 'echo@e-team.com',
        status: 'sent',
        channel: 'internal'
      });
      console.log("✅ [ECHO] Entrée créée dans la table email_replies");
    } catch (replyErr) {
      console.error("❌ Erreur table email_replies:", replyErr.message);
    }
  }

  // ── 7. Create InboxEmail confirmation in Hera's inbox ────────────────────
  try {
    await InboxEmail.create({
      sender: 'echo@e-team.com',
      to: 'hera@e-team.com', // Echo écrit à Hera
      subject: `RE: [STAFFING] Recrutement ${department}`,
      content: `Salut Hera, l'alerte pour ${department} a été traitée. \nPost LinkedIn : ✅ Publié \nFormulaire : ${recruitmentFormUrl}`,
      receivedAt: new Date(),
      isRead: false,
      category: 'recrutement',
      priority: 'medium',
      summary: `Recrutement ${department} lancé.`
    });
    console.log("✅ [ECHO] Message de confirmation envoyé dans l'Inbox de Hera");
  } catch (dbErr) {
    console.warn('⚠️ Erreur trace InboxEmail :', dbErr.message);
  }

  // ── Return result to controller ───────────────────────────────────────────
  return {
    jobOfferId: jobOffer._id,
    linkedinPost: linkedinPostText,
  };
}

module.exports = {
  processStaffingAlert,
  // Exported for testing and direct use
  DEPARTMENT_SKILLS,
};
