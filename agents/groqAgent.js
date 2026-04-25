
const { ChatGroq } = require("@langchain/groq");
const { PromptTemplate } = require("@langchain/core/prompts");
const { StructuredOutputParser } = require("@langchain/core/output_parsers");
const { RunnableSequence } = require("@langchain/core/runnables");

class GroqAgent {
  constructor() {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",  // Modèle actif et performant
      temperature: 0.3,
    });
    
    this.outputParser = StructuredOutputParser.fromNamesAndDescriptions({
      isSpam: "boolean - true si spam, false sinon",
      confidence: "nombre entre 0 et 1",
      category: "string - spam, phishing, promotion, legit",
      reason: "string - explication courte en français"
    });
    
    this.prompt = PromptTemplate.fromTemplate(
      "Tu es un expert en analyse de messages. Détermine si le message est du spam.\n\n" +
      "Message: {message}\n" +
      "Contexte: {context}\n\n" +
      "{format_instructions}\n\n" +
      "Analyse intelligemment, ne te base pas sur des mots-clés simples."
    );
  }
  
  async analyze(message, context = {}) {
    try {
      console.log('🤖 Groq analyse:', message.substring(0, 50));
      
      const chain = RunnableSequence.from([
        this.prompt,
        this.llm,
        this.outputParser
      ]);
      
      const result = await chain.invoke({
        message: message,
        context: JSON.stringify(context),
        format_instructions: this.outputParser.getFormatInstructions()
      });
      
      return {
        success: true,
        ...result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Erreur Groq:', error.message);
      return {
        success: false,
        isSpam: false,
        confidence: 0,
        error: error.message
      };
    }
  }
}

module.exports = new GroqAgent();
