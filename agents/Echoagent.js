const { ChatGroq } = require("@langchain/groq");

class EchoAgent {
  constructor() {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
    });
  }

  async analyze(message, sender = "unknown") {
    const prompt = `
Analyse ce message et réponds UNIQUEMENT avec ce format JSON valide:

Message: ${message}
Expéditeur: ${sender}

{
  "summary": "résumé en une phrase",
  "isUrgent": true ou false,
  "priority": "high" ou "medium" ou "low",
  "actions": ["action1", "action2"],
  "category": "meeting" ou "email" ou "request" ou "alert" ou "info"
}

Règles:
- isUrgent = true si le message contient: urgent, important, asap, critical, panne, down, alerte
- priority = high si isUrgent = true
- actions = liste des choses à faire (max 3)
`;

    try {
      console.log('📤 Envoi à Groq...');
      const response = await this.llm.invoke(prompt);
      console.log('📥 Réponse reçue');
      
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log('✅ Analyse réussie');
        return result;
      }
      
      return {
        summary: message.substring(0, 100),
        isUrgent: false,
        priority: "low",
        actions: [],
        category: "info"
      };
    } catch (error) {
      console.error("❌ Erreur EchoAgent:", error.message);
      return {
        summary: "Erreur d'analyse",
        isUrgent: false,
        priority: "low",
        actions: [],
        category: "error",
        error: error.message
      };
    }
  }
}


module.exports = new EchoAgent();