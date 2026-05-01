// services/dexoService.js
const heraAgent = require('./hera.agent');
const ProjectOpportunity = require('../models/ProjectOpportunity');
const CentralizedEnergyService = require('./energy/centralizedEnergy.service');
const reportService = require('./dexo/report.service');
const documentService = require('./dexo/document.service');
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
  // Delegated to services/dexo/document.service.js
  async processDocumentRequest({ employeeId, docType, details }) {
    return documentService.processDocumentRequest({ employeeId, docType, details });
  }
  // --- LOGIQUE PRIVÉE : ÉNERGIE (SÉCURISÉE) ---
  async _consumeEnergy(type, desc) {
    const energyResult = await CentralizedEnergyService.consumeForAutonomous({
      agentName: 'dexo',
      taskType: type,
      taskDescription: desc,
      metadata: {
        source: 'dexo_service',
        autonomous: true
      }
    });
    
    if (!energyResult.success || energyResult.blocked) {
      console.warn(`⛔ DEXO energy blocked: ${energyResult.securityReason || energyResult.error}`);
      // Note: Dexo operations continue without energy consumption when blocked
      // This preserves existing behavior where Dexo tasks complete regardless of energy
      return false;
    }
    
    console.log(`⚡ [DEXO] Energy consumed successfully: ${energyResult.energyCost} from user ${energyResult.validatedUserId}`);
    return true;
  }

  // --- BRIEFING CEO ---
  // Delegated to services/dexo/report.service.js
  async generateDailyReport(ceoId) {
    return reportService.generateDailyReport(ceoId);
  }

  async sendReport(messageType = 'daily', content = '', metadata = {}) {
    return reportService.sendReport(messageType, content, metadata);
  }
}


module.exports = new DexoService();