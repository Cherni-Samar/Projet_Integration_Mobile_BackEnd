const { ChatGroq } = require("@langchain/groq");

class HeraAgent {
  constructor() {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
    });
  }

  async analyze(message) {
    const today = new Date().toISOString().split('T')[0];
    const prompt = `Tu es Hera, l'IA RH. Aujourd'hui: ${today}.
    L'Admin te donne un ordre concernant un employé.
    
    Analyse ce message: "${message}"
    
    Réponds UNIQUEMENT avec un JSON:
    {
      "intent": "LEAVE_REQUEST" | "HELLO",
      "data": {
        "employee_name": "...", 
        "type": "annual" | "sick" | "urgent",
        "start_date": "YYYY-MM-DD",
        "end_date": "YYYY-MM-DD",
        "reason": "..."
      },
      "reply": "Réponse si c'est juste un bonjour"
    }`;

    try {
      const response = await this.llm.invoke(prompt);
      const match = response.content.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : { intent: "HELLO", reply: "Bonjour Admin !" };
    } catch (e) { return { intent: "HELLO", reply: "Erreur IA" }; }
  }
}
module.exports = new HeraAgent();