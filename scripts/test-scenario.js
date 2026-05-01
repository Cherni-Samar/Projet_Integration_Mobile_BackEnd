#!/usr/bin/env node

/**
 * Quick test runner for the multi-agent scenario
 * Run with: node test-scenario.js
 */

require('dotenv').config();
const { runMultiAgentScenario } = require('./scripts/test-multi-agent-scenario');

console.log('🚀 Starting Multi-Agent Collaboration Test...\n');

runMultiAgentScenario()
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });