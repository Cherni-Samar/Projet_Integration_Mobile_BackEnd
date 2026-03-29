const { ChatGroq } = require("@langchain/groq");

class EchoAgent {
  constructor() {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
    });
  }

  async analyze(message, sender) {
    const prompt = 'Analyse ce message: ' + message + '. Expéditeur: ' + (sender || 'inconnu') + '. Réponds UNIQUEMENT avec un JSON: {"summary": "...", "isUrgent": true/false, "priority": "high/medium/low", "actions": ["..."], "category": "..."}';

    try {
      const response = await this.llm.invoke(prompt);
      const match = response.content.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return { summary: message, isUrgent: false, priority: "low", actions: [], category: "info" };
    } catch (error) {
      return { summary: "Erreur", isUrgent: false, priority: "low", actions: [], category: "error" };
    }
  }
}

module.exports = new EchoAgent();
