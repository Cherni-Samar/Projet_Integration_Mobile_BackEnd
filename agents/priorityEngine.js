const { OpenAI } = require('langchain/llms/openai');
const { PromptTemplate } = require('langchain/prompts');
const { LLMChain } = require('langchain/chains');

class PriorityEngine {
  constructor() {
    this.llm = new OpenAI({
      openaiApiKey: process.env.OPENAI_API_KEY,
      temperature: 0.3,
    });

    this.priorityPrompt = new PromptTemplate({
      template: `Analyze the following message and determine its priority level.\n\nMessage: {message}\n\nRespond with ONLY a JSON object in this format:\n{\n  \
"priority": "HIGH" | "MEDIUM" | "LOW",\n  "score": 0-100,\n  "reason": "brief explanation",\n  "keywords": ["keyword1", "keyword2"]\n}`,
      inputVariables: ['message'],
    });

    this.chain = new LLMChain({
      llm: this.llm,
      prompt: this.priorityPrompt,
    });
  }

  async analyzePriority(message) {
    try {
      const result = await this.chain.call({ message });
      
      // Parse the JSON response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format');
      }
      
      const priority = JSON.parse(jsonMatch[0]);
      
      return {
        success: true,
        message,
        priority,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Priority analysis error:', error.message);
      return {
        success: false,
        message,
        error: error.message,
        priority: { priority: 'MEDIUM', score: 50 },
      };
    }
  }

  async analyzeMultipleMessages(messages) {
    try {
      const results = await Promise.all(
        messages.map(msg => this.analyzePriority(msg))
      );
      
      // Sort by priority score
      return results.sort((a, b) => {
        const scoreA = a.priority?.score || 0;
        const scoreB = b.priority?.score || 0;
        return scoreB - scoreA;
      });
    } catch (error) {
      console.error('Batch priority analysis error:', error.message);
      throw error;
    }
  }
}

module.exports = new PriorityEngine();