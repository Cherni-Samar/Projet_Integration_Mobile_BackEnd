// services/echoSocialIntentService.js — Service d'analyse d'intention sociale
const { ChatGroq } = require('@langchain/groq');

class EchoSocialIntentService {
  constructor() {
    this.llm = this.getLlm();
  }

  getLlm() {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      throw new Error('GROQ_API_KEY manquant dans .env');
    }
    return new ChatGroq({
      apiKey: key,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
    });
  }

  async analyzeIntent(message) {
    try {
      const prompt = `Analyse l'intention de ce message et classifie-la:

Message: ${message}

Réponds au format JSON:
{
  "intent": "reply|linkedin_publish|general",
  "confidence": 0.9,
  "platform": "linkedin|email|general",
  "suggested_action": "Action recommandée"
}`;

      const result = await this.llm.invoke(prompt);
      const text = typeof result.content === 'string' ? result.content.trim() : String(result.content).trim();
      
      try {
        return JSON.parse(text.replace(/^["']|["']$/g, ''));
      } catch {
        return {
          intent: "general",
          confidence: 0.5,
          platform: "general",
          suggested_action: "analyser_manuellement"
        };
      }
    } catch (error) {
      console.error('EchoSocialIntentService error:', error);
      return {
        intent: "error",
        confidence: 0,
        platform: "general",
        suggested_action: "retry"
      };
    }
  }
}

module.exports = new EchoSocialIntentService();