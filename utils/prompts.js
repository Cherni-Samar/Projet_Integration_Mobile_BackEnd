// LangChain prompt templates for message processing, prioritization, summarization, and spam filtering

// Prompt template for message processing
const messageProcessingPrompt = `Extract key information from the following message: {message}`;

// Prompt template for prioritization
const prioritizationPrompt = `Determine the priority level (high, medium, low) for the following message: {message}`;

// Prompt template for summarization
const summarizationPrompt = `Summarize the following message and capture the main points: {message}`;

// Prompt template for spam filtering
const spamFilteringPrompt = `Classify the following message as spam or not spam: {message}`;

module.exports = {
    messageProcessingPrompt,
    prioritizationPrompt,
    summarizationPrompt,
    spamFilteringPrompt,
};