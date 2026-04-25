const { LLMChain } = require('langchain/chains');
const { OpenAI } = require('langchain/llms/openai');
const { PromptTemplate } = require('langchain/prompts');

class SummaryEngine {
  constructor() {
    this.llm = new OpenAI({
      openaiApiKey: process.env.OPENAI_API_KEY,
      temperature: 0.5,
    });

    this.summaryPrompt = new PromptTemplate({
      template: `Summarize the following conversation concisely while preserving key information and action items.\n\nConversation:\n{messages}\n\nProvide the summary in this JSON format:\n{\n  \\"summary\\": \\"brief summary\\",\n  \\"keyPoints\\": [\\"point1\\", \\"point2\\"],\n  \\"actionItems\\": [\\"action1\\", \\"action2\\"],\n  \\"sentiment\\": \\"positive|negative|neutral\\"\n}`,
      inputVariables: ['messages'],
    });

    this.chain = new LLMChain({
      llm: this.llm,
      prompt: this.summaryPrompt,
    });
  }

  async summarizeConversation(messages) {
    try {
      const messagesText = Array.isArray(messages)
        ? messages.map((msg, idx) => `${idx + 1}. ${msg}`).join('\n')
        : messages;

      const result = await this.chain.call({ messages: messagesText });
      
      const jsonMatch = result.text.match(/\{[\\s\\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format');
      }
      
      const summary = JSON.parse(jsonMatch[0]);
      
      return {
        success: true,
        messageCount: Array.isArray(messages) ? messages.length : 1,
        summary,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Summary generation error:', error.message);
      return {
        success: false,
        error: error.message,
        summary: { summary: 'Unable to generate summary', keyPoints: [], actionItems: [] },
      };
    }
  }

  async summarizeLongThread(messages, chunkSize = 5) {
    try {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages must be a non-empty array');
      }

      const chunks = [];
      for (let i = 0; i < messages.length; i += chunkSize) {
        chunks.push(messages.slice(i, i + chunkSize));
      }

      const chunkSummaries = await Promise.all(
        chunks.map(chunk => this.summarizeConversation(chunk))
      );

      if (chunks.length > 1) {
        const summaryTexts = chunkSummaries
          .map(s => s.summary?.summary || '')
          .filter(Boolean);
        
        return await this.summarizeConversation(summaryTexts);
      }

      return chunkSummaries[0];
    } catch (error) {
      console.error('Long thread summarization error:', error.message);
      throw error;
    }
  }
}

module.exports = new SummaryEngine();