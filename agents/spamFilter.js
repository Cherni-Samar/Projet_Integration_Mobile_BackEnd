const { ChatOpenAI } = require('@langchain/openai');
const { PromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');

class SpamFilter {
  constructor() {
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-3.5-turbo",
      temperature: 0.1,
      maxTokens: 100
    });

    this.prompt = PromptTemplate.fromTemplate(`
Tu es un expert en détection de spam. Analyse ce message et détermine s'il s'agit de spam.

Message: "{message}"

Réponds UNIQUEMENT avec un objet JSON valide contenant:
- isSpam: boolean (true si c'est du spam, false sinon)
- confidence: number entre 0 et 1
- reason: string (explication courte en français)

Exemple de réponse:
{{"isSpam": true, "confidence": 0.95, "reason": "Contient des mots-clés promotionnels agressifs"}}

Réponse JSON:
`);
  }

  async detectSpam(message) {
    try {
      const chain = this.prompt.pipe(this.llm).pipe(new StringOutputParser());
      const response = await chain.invoke({ message });
      
      // Extraire le JSON de la réponse
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          isSpam: result.isSpam,
          confidence: result.confidence,
          reason: result.reason,
          success: true
        };
      }
      
      return {
        isSpam: false,
        confidence: 0,
        reason: 'Analyse non concluante',
        success: false
      };
    } catch (error) {
      console.error('Erreur détection spam:', error);
      return {
        isSpam: false,
        confidence: 0,
        reason: error.message,
        success: false
      };
    }
  }
}

module.exports = new SpamFilter();