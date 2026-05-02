// services/groqAgent.js
// Groq-powered spam detection agent.
// Used by messageController.js (spamCheck endpoint) and
// middleware/messageMiddleware.js (quickSpamGuard).
//
// Returns: { success, isSpam, confidence, reason, category }

const { ChatGroq } = require('@langchain/groq');
const { PromptTemplate } = require('@langchain/core/prompts');
const { RunnableSequence } = require('@langchain/core/runnables');
const { StructuredOutputParser } = require('@langchain/core/output_parsers');
const { z } = require('zod');

const spamSchema = z.object({
  isSpam:     z.boolean().describe('true si le message est du spam, false sinon'),
  confidence: z.number().min(0).max(1).describe('niveau de confiance entre 0 et 1'),
  category:   z.enum(['spam', 'phishing', 'promotion', 'legit']).describe('catégorie du message'),
  reason:     z.string().describe('explication courte en français'),
});

class GroqAgent {
  constructor() {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1, // Low temperature for consistent spam classification
    });

    this.parser = StructuredOutputParser.fromZodSchema(spamSchema);

    this.prompt = PromptTemplate.fromTemplate(
      `Tu es un expert en détection de spam et de messages malveillants.
Analyse le message suivant et détermine s'il est du spam.

Message: {message}
Contexte: {context}

Règles d'analyse:
- spam: messages non sollicités, publicités abusives, chaînes de messages
- phishing: tentatives d'hameçonnage, faux liens, usurpation d'identité
- promotion: publicités légitimes mais non sollicitées
- legit: message légitime et pertinent

Ne te base pas uniquement sur des mots-clés. Analyse le contexte et l'intention.

{format_instructions}`
    );

    this.chain = RunnableSequence.from([
      this.prompt,
      this.llm,
      this.parser,
    ]);
  }

  async analyze(message, context = {}) {
    try {
      console.log('🤖 GroqAgent analyse le message pour spam...');

      const result = await this.chain.invoke({
        message: message,
        context: typeof context === 'object' ? JSON.stringify(context) : String(context),
        format_instructions: this.parser.getFormatInstructions(),
      });

      return {
        success: true,
        isSpam:     result.isSpam,
        confidence: result.confidence,
        category:   result.category,
        reason:     result.reason,
        timestamp:  new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ GroqAgent erreur:', error.message);
      return {
        success:    false,
        isSpam:     false,
        confidence: 0,
        category:   'legit',
        reason:     'Analyse échouée — message autorisé par défaut',
        error:      error.message,
      };
    }
  }
}

module.exports = new GroqAgent();
