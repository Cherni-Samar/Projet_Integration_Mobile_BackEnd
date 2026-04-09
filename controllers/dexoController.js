const HeraAction = require('../models/HeraAction');
const heraAgent = require('../services/hera.agent');

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