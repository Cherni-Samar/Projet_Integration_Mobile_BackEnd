const HeraAction = require('../models/HeraAction');
const heraAgent = require('../services/hera.agent');
const nodemailer = require('nodemailer');
const Employee = require('../models/Employee'); // ✅ INDISPENSABLE : Ajoute cette ligne !

exports.getDailyCheckUp = async (req, res) => {
  try {
    // 1. Récupérer les dernières actions (Hera + Echo)
    const actions = await HeraAction.find().sort({ created_at: -1 }).limit(10).populate('employee_id');

    if (!actions || actions.length === 0) {
      return res.json({
        success: true,
        report: "🏢 Statut : Calme. Le système surveille les effectifs. Aucune action requise pour le moment.",
        rawActions: []
      });
    }

    // 2. Traduction des termes techniques pour l'IA
    const logSummary = actions.map(a => {
      let type = a.action_type;
      if (type === 'absence_alert') type = "Alerte de sous-effectif (Staffing)";
      if (type === 'contract_renewal') type = "Édition de contrat (Onboarding)";
      if (type === 'leave_approved') type = "Validation de planning (Congés)";
      return `- ${type} pour ${a.employee_id?.name || a.details?.department || 'le système'}`;
    }).join('\n');

    // 3. Prompt intelligent pour Groq
    const prompt = `Tu es Dexo, l'IA Superviseur de E-Team. Rédige un briefing très court (3 points max) pour le CEO. 
    Utilise un ton de direction. Ne parle jamais d' "absence" mais de "staffing". 
    Voici les données : ${logSummary}`;

    const aiResponse = await heraAgent.llm.invoke(prompt);

    res.json({
      success: true,
      report: aiResponse.content, // Le texte de Groq
      rawActions: actions.slice(0, 3) // On n'envoie que les 3 dernières alertes au front
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
const generateBriefingLogic = async () => {
    const actions = await HeraAction.find().sort({ created_at: -1 }).limit(10).populate('employee_id');
    
    if (!actions || actions.length === 0) {
        return "🏢 Statut : Calme. Aucune activité RH majeure à signaler pour le moment.";
    }

const logSummary = actions.map(a => {
        let type = a.action_type;
        if (type === 'absence_alert') type = "Alerte staffing";
        if (type === 'contract_renewal') type = "Onboarding contrat";
        if (type === 'leave_approved') type = "Congé validé";
        if (type === 'doc_request') type = "Document envoyé par mail"; // <--- Ajoute ça
        return `- ${type} pour ${a.employee_id?.name || a.details?.department || 'système'}`;
    }).join('\n');

    const prompt = `Tu es Dexo, superviseur de E-Team. Rédige une synthèse très courte (2 phrases max) pour le CEO à partir de ces logs : ${logSummary}. Sois pro.`;
    const aiResponse = await heraAgent.llm.invoke(prompt);
    
    return aiResponse.content;
};
// Configuration du transporteur de mail (ex: Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'eya.mosbahi@esprit.tn',
    pass: '221JFT5553' 
  }
});

exports.requestDocument = async (req, res) => {
  const { employeeId, docType } = req.body; // docType: 'attestation', 'contrat', 'bulletin'

  try {
    // 1. Chercher l'employé et son email
    const employee = await Employee.findById(employeeId); 
    if (!employee) return res.status(404).json({ message: "Employé non trouvé" });

    // 2. Définir le chemin du fichier (tu dois avoir ces PDF quelque part sur ton serveur)
    const filePath = `./storage/docs/${docType}_${employeeId}.pdf`;

    // 3. Envoyer le mail
    const mailOptions = {
      from: '"Dexo IA" <ton-email@gmail.com>',
      to: employee.email,
      subject: `Votre ${docType} - E-Team`,
      text: `Bonjour ${employee.name}, voici le document demandé par Dexo.`,
      attachments: [{ filename: `${docType}.pdf`, path: filePath }]
    };

    await transporter.sendMail(mailOptions);

    // 4. Enregistrer l'action dans HeraAction pour que ça apparaisse dans le rapport du soir !
    await HeraAction.create({
      action_type: 'doc_request',
      employee_id: employeeId,
      details: { document: docType, status: 'sent_by_email' }
    });

    res.json({ success: true, message: "Document envoyé par mail." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.generateBriefingLogic = generateBriefingLogic;
