// services/spamFilter.js
const { langchainConfig } = require('../config/langchainConfig');

class SpamFilter {
  constructor() {
    this.spamKeywords = langchainConfig.spam?.spamKeywords || [
      'viagra', 'casino', 'lottery', 'free money', 'click here',
      'limited offer', 'act now', 'buy now', 'winner', 'congratulations'
    ];
    this.confidenceThreshold = langchainConfig.spam?.confidenceThreshold || 0.8;
  }

  quickKeywordCheck(message) {
    const lowerMessage = message.toLowerCase();
    const foundKeywords = this.spamKeywords.filter(kw =>
      lowerMessage.includes(kw.toLowerCase())
    );
    return {
      hasSpamKeywords: foundKeywords.length > 0,
      foundKeywords,
    };
  }

  async detectSpam(message) {
    try {
      const keywordCheck = this.quickKeywordCheck(message);
      const isSpam = keywordCheck.hasSpamKeywords;
      const confidence = isSpam ? 0.85 : 0.15;
      const category = isSpam ? 'spam' : 'legitimate';
      const reason = isSpam ? 'Mots-clés suspects détectés' : 'Message semble légitime';

      return {
        success: true,
        message,
        isSpam,
        confidence,
        reason,
        category,
        flaggedKeywords: keywordCheck.foundKeywords,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Erreur filtre spam:', error.message);
      return {
        success: false,
        message,
        isSpam: false,
        confidence: 0,
        reason: 'Analyse échouée',
        error: error.message,
      };
    }
  }

  async filterMessages(messages) {
    const results = await Promise.all(
      messages.map(msg => this.detectSpam(typeof msg === 'string' ? msg : msg.content))
    );
    return {
      total: messages.length,
      spamCount: results.filter(r => r.isSpam).length,
      cleanMessages: results.filter(r => !r.isSpam),
      spamMessages: results.filter(r => r.isSpam),
      results,
    };
  }
}

module.exports = new SpamFilter();