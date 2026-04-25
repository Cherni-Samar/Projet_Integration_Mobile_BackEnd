require('dotenv').config();

const langchainConfig = {
  messageProcessing: {
    enableSpamFilter: process.env.ENABLE_SPAM_FILTER !== 'false',
    enablePriority: process.env.ENABLE_PRIORITY !== 'false',
    enableSummarization: process.env.ENABLE_SUMMARIZATION !== 'false',
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH) || 5000,
    minMessageLength: parseInt(process.env.MIN_MESSAGE_LENGTH) || 1,
    processingTimeout: parseInt(process.env.PROCESSING_TIMEOUT) || 60000,
  },
  spam: {
    confidenceThreshold: parseFloat(process.env.SPAM_CONFIDENCE_THRESHOLD) || 0.8,
    spamKeywords: [
      'viagra', 'casino', 'lottery', 'free money', 'click here',
      'limited offer', 'act now', 'buy now', 'winner', 'congratulations'
    ],
  },
  logging: {
    enabled: process.env.ENABLE_LOGGING !== 'false',
    level: process.env.LOG_LEVEL || 'info',
  },
};

const initializeConfig = () => {
  console.log('✅ LangChain configuration initialized');
  return langchainConfig;
};

const validateConfig = () => {
  return true;
};

module.exports = {
  langchainConfig,
  initializeConfig,
  validateConfig,
};