const { ChatGroq } = require("@langchain/groq");

class HeraAgent {
  constructor() {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0.1, // Bas pour avoir des scores constants
    });
  }

  // --- ANALYSE DES MESSAGES ADMIN (Déjà existant) ---
  async analyze(message) {
    const today = new Date().toISOString().split('T')[0];
    const prompt = `Tu es Hera, l'IA RH. Aujourd'hui: ${today}.
    Réponds UNIQUEMENT en JSON: 
    { "intent": "LEAVE_REQUEST" | "HELLO", "data": { "employee_name": "...", "type": "annual/sick/urgent", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" }, "reply": "..." }
    Message: "${message}"`;

    try {
      const response = await this.llm.invoke(prompt);
      const match = response.content.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : { intent: "HELLO", reply: "Bonjour" };
    } catch (e) { return { intent: "HELLO", reply: "Bug technique" }; }
  }

  // --- ✅ NOUVELLE MÉTHODE : ANALYSE DE CV (ATS) ---
  async analyzeCandidate(resumeText, jobDescription) {
    const prompt = `
    Tu es un expert en recrutement RH (système ATS). 
    Analyse le CV du candidat par rapport à la description du poste.
    
    POSTE : "${jobDescription}"
    CV : "${resumeText}"
    
    Calcule un score de matching technique (0 à 100).
    Réponds UNIQUEMENT avec un JSON : {"score": 85, "reason": "Explication courte"}
    `;

    try {
      const response = await this.llm.invoke(prompt);
      const match = response.content.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return { score: 50, reason: "Analyse simplifiée" };
    } catch (error) {
      console.error("Erreur IA Score:", error);
      return { score: 40, reason: "Erreur lors de l'analyse" };
    }
  }
}

module.exports = new HeraAgent();