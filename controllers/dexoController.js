const HeraAction = require('../models/HeraAction');
const heraAgent = require('../services/hera.agent');
const Employee = require('../models/Employee');
const mailService = require('../utils/emailService');
const Document = require('../models/Document');
const crypto = require('crypto');
const pdfGenerator = require('../services/pdfGenerator'); // ✅ AJOUTER CETTE LIGNE

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
    const prompt = `Tu es Dexo, l'IA Superviseur de E-Team. Rédige un briefing très court (3 points max) pour le CEO. Utilise un ton de direction. Ne parle jamais d' "absence" mais de "staffing". Voici les données : ${logSummary}`;
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

exports.requestDocument = async (req, res) => {
  const { employeeId, docType, details } = req.body;

  try {
    console.log('[DEXO] Demande de document reçue:', { employeeId, docType, details });

    // 1. Trouver l'employé
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      console.error('[DEXO] Employé non trouvé:', employeeId);
      return res.status(404).json({ success: false, message: "Employé non trouvé" });
    }

    console.log('[DEXO] Employé trouvé:', employee.name);

    // 2. ✅ GÉNÉRATION DU PDF PAR DEXO
    let pdfResult;
    if (docType === 'attestation') {
      console.log('[DEXO] Génération attestation PDF...');
      pdfResult = await pdfGenerator.generateAttestationPDF(employee, details);
    } else if (docType === 'bulletin') {
      console.log('[DEXO] Génération bulletin PDF...');
      pdfResult = await pdfGenerator.generateBulletinPDF(employee, details);
    } else {
      return res.status(400).json({ success: false, message: "Type de document invalide" });
    }

    console.log('[DEXO] PDF généré:', pdfResult.filename);
    console.log('[DEXO] Chemin:', pdfResult.filepath);

    // 3. Préparation des métadonnées
    const category = docType === 'attestation' ? 'rh' : 'finance';
    const fileHash = crypto.createHash('md5').update(pdfResult.filename + Date.now()).digest('hex');

    // 4. ✅ CRÉATION DANS LA TABLE DOCUMENTS
    const newDoc = await Document.create({
      filename: pdfResult.filename,
      originalName: docType === 'attestation' ? "Attestation de Travail" : "Bulletin de Paie",
      suggestedName: `Document_Officiel_${employee.name}`,
      category: category,
      confidentialityLevel: 'interne',
      accessRoles: ['employee', 'hr', 'admin'],
      filePath: pdfResult.filepath,
      mimetype: 'application/pdf',
      size: 1024,
      hash: fileHash,
      uploadedBy: employeeId,
      priority: details.reason === 'Visa' ? 'high' : 'medium',
      status: 'active',
      customMetadata: details
    });

    console.log('[DEXO] Document créé dans la base:', newDoc._id);

    // 5. ✅ LIVRAISON PAR HERA (avec le PDF généré)
    console.log('[DEXO] Transmission à Hera pour envoi email...');
    await mailService.sendHeraDocumentEmail(employee.email, {
      name: employee.name,
      type: docType === 'attestation' ? "Attestation de Travail" : "Bulletin de Paie",
      details: details,
      pdfPath: pdfResult.filepath,
      pdfFilename: pdfResult.filename
    });

    // 6. ✅ LOG POUR LE DASHBOARD DEXO
    await HeraAction.create({
      employee_id: employee._id,
      action_type: 'doc_request',
      details: { 
        document: newDoc.originalName, // ✅ Utilise le nom officiel du document
        category: category,
        db_id: newDoc._id,
        docType: docType, // ✅ Ajouter le type pour clarification
        reason: details.reason, // ✅ Ajouter la raison
        month: details.month,   // ✅ Ajouter le mois (pour bulletins)
        year: details.year      // ✅ Ajouter l'année (pour bulletins)
      },
      triggered_by: 'employee'
    });

    console.log('[DEXO] Processus terminé avec succès');

    res.json({ 
      success: true, 
      message: "Document généré et envoyé par email",
      documentId: newDoc._id,
      filename: pdfResult.filename
    });

  } catch (err) {
    console.error('[DEXO] Erreur:', err.message);
    console.error('[DEXO] Stack:', err.stack);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ✅ NOUVELLE FONCTION - Récupère les actions de documents pour Dexo Dashboard
// ═══════════════════════════════════════════════════════════════════════════

exports.getDocumentActions = async (req, res) => {
  const { limit = 20 } = req.query;

  try {
    // Récupérer les actions de type 'doc_request' avec les infos de l'employé
    const actions = await HeraAction.find({ action_type: 'doc_request' })
      .populate('employee_id', 'name email') // Récupère le nom et email de l'employé
      .sort({ created_at: -1 }) // Plus récent en premier
      .limit(parseInt(limit));

    // Formater les données pour le frontend
    const formattedActions = actions.map(action => {
      const details = action.details || {};
      
      return {
        _id: action._id,
        employee_name: action.employee_id?.name || 'Employé inconnu',
        employee_email: action.employee_id?.email || '',
        action_type: action.action_type,
        category: details.category || 'general',
        details: {
          document: details.document || 'Document',
          category: details.category || 'general',
          db_id: details.db_id,
          reason: details.reason, // Pour les attestations
          month: details.month,   // Pour les bulletins
          year: details.year,     // Pour les bulletins
        },
        created_at: action.created_at,
        createdAt: action.created_at, // Alias pour compatibilité
      };
    });

    res.json({
      success: true,
      count: formattedActions.length,
      actions: formattedActions,
    });

  } catch (err) {
    console.error('❌ Erreur getDocumentActions:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

exports.generateBriefingLogic = generateBriefingLogic;
