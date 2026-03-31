// spamFilter.js

const { LLMChain } = require('langchain/chains');
const { OpenAI } = require('langchain/llms/openai');

// Create an instance of OpenAI with your API key
const llm = new OpenAI({ apiKey: 'YOUR_API_KEY' });

// Initialize the LLM Chain for spam detection
const spamTextClassifier = new LLMChain({
  llm,
  prompt: `Classify the following message as spam or not spam: {input}`,
});

// Function to detect spam
async function detectSpam(message) {
  const response = await spamTextClassifier.call({ input: message });
  return response;
}

// Example usage
(async () => {
  const message = 'Congratulations! You have won a free ticket!';
  const result = await detectSpam(message);
  console.log(`The message is classified as: ${result}`);
});

module.exports = { detectSpam };