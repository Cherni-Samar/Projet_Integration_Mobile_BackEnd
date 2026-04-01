// langchainConfig.js

const { OpenAI } = require('langchain/llms');
const { LLMChain, PromptTemplate } = require('langchain/chains');

// LangChain configuration for OpenAI integration
const openai = new OpenAI({
    openaiApiKey: 'your-openai-api-key', // Replace with your OpenAI API key
});

// Setting up a prompt template
const template = new PromptTemplate({
    template: 'What is the capital of {country}?',
    inputVariables: ['country'],
});

// Creating a chain with the OpenAI model
const chain = new LLMChain({
    llm: openai,
    prompt: template,
});

module.exports = { chain };