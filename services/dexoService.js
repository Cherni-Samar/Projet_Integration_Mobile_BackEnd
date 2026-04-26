// services/dexoService.js
const HeraAction = require('../models/HeraAction');
const heraAgent = require('./hera.agent');
const Employee = require('../models/Employee');
const mailService = require('../utils/emailService');
const Document = require('../models/Document');
const ProjectOpportunity = require('../models/ProjectOpportunity');
const pdfGenerator = require('./pdfGenerator');
const crypto = require('crypto');
const ActivityLogger = require('./activityLogger.service');
const { manualEnergyConsumption } = require('../middleware/energyMiddleware');
const fs = require('fs');
class DexoService {
  
  // --- STRATÉGIE & ONBOARDING DYNAMIQUE ---
async getStrategicAdvice(messages) {
const prompt = `
Tu es Dexo, superviseur stratégique d'une entreprise.

Objectif:
Comprendre l'entreprise du CEO et proposer une structure organisationnelle réaliste.

Question principale:
Tu dois comprendre:
- le secteur de l'entreprise
- l'activité principale
- le modèle économique
- les opérations nécessaires
- les fonctions internes indispensables

Règles:
- Ne propose PAS toujours Tech, Design, Marketing.
- Les départements doivent dépendre du type d'entreprise.
- Tu peux proposer entre 3 et 6 départements.
- Chaque département doit avoir un nombre cible d'employés.
- Si une entreprise n'a pas besoin de Tech, ne propose pas Tech.
- Si une entreprise est digitale ou SaaS, Tech peut être important.
- Si une entreprise vend des produits, propose Operations / Marketing / Support / Finance si pertinent.
- Tu poses MAXIMUM 2 questions.
- Si tu as assez d'informations, propose directement.

Conversation:
${JSON.stringify(messages)}

Agents disponibles:
- Hera: RH, recrutement, employés, congés, onboarding
- Echo: communication, marketing, emails, réseaux sociaux
- Timo: planning, tâches, calendrier, opérations
- Dexo: supervision stratégique, reporting, documents
- Kash: finance, budgets, coûts, paiements

Format JSON STRICT:
{
  "isFinished": boolean,
  "nextQuestion": string | null,
  "proposal": {
    "departments": [
      {
        "name": "Marketing",
        "targetCount": 3,
        "reason": "Pourquoi ce département est nécessaire"
      }
    ],
    "explanation": "Résumé stratégique court"
  },
  "recommendedAgents": [
    {
      "id": "hera",
      "name": "Hera",
      "reason": "Pourquoi cet agent est utile"
    }
  ]
}
`;

  const aiResponse = await heraAgent.llm.invoke(prompt);
  return JSON.parse(aiResponse.content.match(/\{.*\}/s)[0]);
}

  // --- ANALYSE DE PROJET (EMAIL CLIENT) ---
  async analyzeProjectProposal(email) {
const prompt = `
Tu es Dexo, superviseur stratégique d'une organisation AI.

Objectif :
Analyser la vision business du CEO et proposer rapidement :
1. Une structure d'équipe : Tech, Design, Marketing
2. Les agents AI nécessaires à l'organisation

Conversation:
${JSON.stringify(messages)}

Agents disponibles :
- Hera : RH, recrutement, employés, congés, onboarding
- Echo : communication, emails, marketing, posts réseaux sociaux
- Timo : planning, rendez-vous, calendrier, tâches
- Dexo : supervision stratégique, documents, reporting, pilotage

Règles :
- Tu poses MAXIMUM 2 questions.
- Si tu as secteur + cible + objectif, tu proposes directement.
- Tu fais des hypothèses intelligentes.
- Tu recommandes uniquement les agents utiles.
- Si le projet implique recrutement ou équipe humaine, recommande Hera.
- Si le projet implique marketing, réseaux sociaux ou communication, recommande Echo.
- Si le projet implique rendez-vous, planification ou opérations, recommande Timo.
- Dexo est recommandé si le CEO veut pilotage stratégique ou reporting.

Format JSON STRICT :
{
  "isFinished": boolean,
  "nextQuestion": string | null,
  "proposal": {
    "tech": number,
    "design": number,
    "marketing": number,
    "explanation": string
  },
  "recommendedAgents": [
    {
      "id": "hera",
      "name": "Hera",
      "reason": "string"
    }
  ]
}
`;
    const aiResponse = await heraAgent.llm.invoke(prompt);
    const data = JSON.parse(aiResponse.content.match(/\{.*\}/s)[0]);
    
    if (data.isProject) {
      return await ProjectOpportunity.create({
        title: data.title,
        clientEmail: email.sender,
        description: email.content,
        estimatedBudget: data.budget,
        requiredEmployees: data.staffNeeded,
        durationMonths: data.duration,
        department: data.dept,
        aiAnalysis: data.strategy
      });
    }
    return null;
  }

  // --- GÉNÉRATION DE DOCUMENTS (FACTORY) ---
async processDocumentRequest({ employeeId, docType, details }) {
  console.log('📄 processDocumentRequest payload:', {
    employeeId,
    docType,
    details,
  });

  const employee = await Employee.findById(employeeId);
  if (!employee) throw new Error("Employé non trouvé");

  console.log('👤 Employee trouvé:', employee.email);

  let pdfResult;
  try {
    pdfResult = docType === 'attestation'
      ? await pdfGenerator.generateAttestationPDF(employee, details)
      : await pdfGenerator.generateBulletinPDF(employee, details);

    console.log('✅ PDF généré:', pdfResult);
  } catch (e) {
    console.error('❌ Erreur PDF:', e);
    throw new Error('PDF_ERROR: ' + e.message);
  }

  let newDoc;
  try {
    const fileHash = crypto
      .createHash('md5')
      .update(pdfResult.filename + Date.now())
      .digest('hex');

    const stats = fs.statSync(pdfResult.filepath);

    newDoc = await Document.create({
      filename: pdfResult.filename,
      originalName: docType === 'attestation' ? 'Attestation' : 'Bulletin',
      category: docType === 'attestation' ? 'rh' : 'finance',
      uploadedBy: employeeId,
      hash: fileHash,
      filePath: pdfResult.filepath,
      mimetype: 'application/pdf',
      size: stats.size,
      customMetadata: details || {},
    });

    console.log('✅ Document archivé:', newDoc._id);

  await HeraAction.create({
  ceo_id: employee.ceo_id,
  employee_id: employee._id,
  action_type: 'doc_request',
  triggered_by: 'employee',
  details: {
    document: docType,
    filename: pdfResult.filename,
    reason: details?.reason || null,
    documentId: newDoc._id,
  },
});

console.log('✅ Action Hera doc_request créée');
  } catch (e) {
    console.error('❌ Erreur Document DB / HeraAction:', e);
    throw new Error('DOCUMENT_DB_ERROR: ' + e.message);
  }

  try {
    await mailService.sendHeraDocumentEmail(employee.email, {
      name: employee.name,
      type: "Attestation de Travail",
      pdfFilename: pdfResult.filename,
      pdfPath: pdfResult.filepath,
      details,
    });

    console.log('✅ Email envoyé à:', employee.email);
  } catch (e) {
    console.error('❌ Erreur email:', e);
    throw new Error('EMAIL_ERROR: ' + e.message);
  }

  return {
    docId: newDoc._id,
    filename: pdfResult.filename,
  };
}
  // --- LOGIQUE PRIVÉE : ÉNERGIE ---
  async _consumeEnergy(type, desc) {
    const User = require('../models/User');
    const user = await User.findOne({ energyBalance: { $gt: 0 } }).sort({ energyBalance: -1 });
    if (user) {
      await manualEnergyConsumption('dexo', type, desc, {}, user._id.toString());
    }
  }

  // --- BRIEFING CEO ---
 async generateDailyReport(ceoId) {
  const query = ceoId ? { ceo_id: ceoId } : {};

  const actions = await HeraAction.find(query)
    .sort({ created_at: -1 })
    .limit(10)
    .populate('employee_id');

  if (actions.length === 0) return "🏢 Statut : Calme.";

  const summary = actions
    .map(a => `- ${a.action_type} pour ${a.employee_id?.name || 'Système'}`)
    .join('\n');

  const aiResponse = await heraAgent.llm.invoke(
    `Tu es Dexo. Rédige un briefing très court pour le CEO : ${summary}`
  );

  return aiResponse.content;
}
}

module.exports = new DexoService();