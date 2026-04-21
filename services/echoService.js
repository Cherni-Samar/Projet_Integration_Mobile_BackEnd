const { ChatGroq } = require("@langchain/groq");
const { PromptTemplate } = require("@langchain/core/prompts");
const { RunnableSequence } = require("@langchain/core/runnables");

class EchoService {
  constructor() {
    console.log('🔧 Initialisation EchoService...');
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
    });
    console.log('✅ EchoService initialisé');
  }

  async sendTextMessage(message, sender = "unknown", instruction = null) {
    console.log('📨 EchoService.sendTextMessage appelé');
   
    try {
      let prompt;
     
      if (instruction && instruction.includes('Analyse')) {
        prompt = instruction + "\n\nMessage: " + message + "\n\nRéponds UNIQUEMENT avec ce format JSON, sans texte avant ou après:\n{\n  \"summary\": \"résumé clair en une phrase\",\n  \"isUrgent\": false,\n  \"isSpam\": false,\n  \"priority\": \"medium\",\n  \"actions\": [\"action1\"],\n  \"category\": \"inbox\"\n}";
      }
      else if (instruction && instruction.includes('réponse')) {
        prompt = instruction + "\n\nMessage: " + message + "\n\nÉcris UNIQUEMENT le texte de ta réponse, sans JSON ni commentaire.";
      }
      else {
        prompt = "Analyse ce message et réponds UNIQUEMENT avec ce format JSON:\n{\n  \"summary\": \"résumé clair en une phrase\",\n  \"isUrgent\": false,\n  \"isSpam\": false,\n  \"priority\": \"medium\",\n  \"actions\": [\"action1\"],\n  \"category\": \"inbox\"\n}\n\nMessage: " + message;
      }
     
      const response = await this.llm.invoke(prompt);
      let text = response.content;
     
      if (instruction && instruction.includes('réponse')) {
        return {
          success: true,
          fullResponse: text,
          summary: text.substring(0, 100)
        };
      }
     
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          summary: parsed.summary || "Message reçu",
          isUrgent: parsed.isUrgent === true,
          isSpam: parsed.isSpam === true,
          priority: parsed.priority || 'medium',
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
          category: parsed.category || 'inbox',
          fullResponse: text
        };
      }
     
      return {
        success: true,
        summary: text.substring(0, 100),
        fullResponse: text,
        isUrgent: false,
        isSpam: false,
        priority: 'medium',
        actions: [],
        category: 'inbox'
      };
     
    } catch (error) {
      console.error('❌ Erreur EchoService:', error.message);
      return {
        success: false,
        summary: "Erreur d'analyse",
        fullResponse: "Désolé, une erreur est survenue.",
        isUrgent: false,
        isSpam: false,
        priority: 'medium',
        actions: [],
        category: 'inbox',
        error: error.message
      };
    }
  }
}
// Dans utils/emailService.js
exports.sendHeraDocumentEmail = async (email, docData) => {
  const mailOptions = {
    from: '"Hera (E-Team RH)" <votre-email-projet@gmail.com>', // Hera envoie
    to: email,
    subject: `📩 Votre ${docData.type} - E-Team`,
    text: `Bonjour ${docData.name},\n\nDexo a généré votre document officiel (${docData.id}).\n\nJe vous le transmets en pièce jointe.\n\nCordialement,\nHera, votre Agent RH.`,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = new EchoService();