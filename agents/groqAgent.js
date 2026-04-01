const { ChatGroq } = require("@langchain/groq");

class GroqAgent {
  constructor() {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
    });
  }

  async detectSpam(message) {
    const prompt = `
Analyse ce message et détermine si c'est du spam.
Réponds UNIQUEMENT avec ce format JSON:

Message: "${message}"

{
  "isSpam": true ou false,
  "confidence": 0.0 à 1.0,
  "reason": "explication courte",
  "category": "spam" ou "phishing" ou "promotion" ou "legit"
}
`;

    try {
      const response = await this.llm.invoke(prompt);
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { isSpam: false, confidence: 0, reason: "Erreur", category: "legit" };
    } catch (error) {
      return { isSpam: false, confidence: 0, reason: error.message, category: "error" };
    }
  }
}

module.exports = new GroqAgent();