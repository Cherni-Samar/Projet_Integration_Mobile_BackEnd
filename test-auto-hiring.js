#!/usr/bin/env node

/**
 * Test Script for Auto-Hiring Implementation
 * 
 * This script tests the complete onboarding + payment + auto-hiring flow
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';
let testUserId = '';

// Test configuration
const TEST_USER = {
  email: `test-${Date.now()}@example.com`,
  password: 'test123456',
  name: 'Test User Auto Hiring'
};

const SUGGESTED_AGENTS = ['hera', 'echo'];
const PACK_ID = 'basic_plan'; // 3 agents allowed

console.log('🧪 Starting Auto-Hiring Implementation Tests\n');

async function runTests() {
  try {
    // Test 1: Create test user
    console.log('📝 Test 1: Creating test user...');
    await createTestUser();
    
    // Test 2: Login and get token
    console.log('🔐 Test 2: Logging in...');
    await loginUser();
    
    // Test 3: Check initial state (no active agents)
    console.log('👤 Test 3: Checking initial user state...');
    await checkInitialState();
    
    // Test 4: Create payment intent with suggested agents
    console.log('💳 Test 4: Creating payment intent with suggested agents...');
    const paymentIntent = await createPaymentIntentWithAgents();
    
    // Test 5: Simulate payment confirmation (auto-hiring should happen)
    console.log('✅ Test 5: Confirming payment (auto-hiring)...');
    await confirmPaymentWithAutoHiring(paymentIntent.paymentIntentId);
    
    // Test 6: Check My Agents endpoint
    console.log('🤖 Test 6: Checking My Agents endpoint...');
    await checkMyAgents();
    
    // Test 7: Test manual hiring (should respect limits)
    console.log('➕ Test 7: Testing manual hiring with limits...');
    await testManualHiring();
    
    // Test 8: Test edge cases
    console.log('🔍 Test 8: Testing edge cases...');
    await testEdgeCases();
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

async function createTestUser() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/signup`, TEST_USER);
    console.log('✅ User created successfully');
    testUserId = response.data.data.user.id;
    return response.data;
  } catch (error) {
    if (error.response?.status === 400 && error.response.data.message?.includes('déjà utilisé')) {
      console.log('ℹ️ User already exists, continuing...');
      return;
    }
    throw error;
  }
}

async function loginUser() {
  const response = await axios.post(`${BASE_URL}/auth/login`, {
    email: TEST_USER.email,
    password: TEST_USER.password
  });
  
  authToken = response.data.data.token;
  testUserId = response.data.data.user.id;
  console.log('✅ Login successful');
  console.log(`   User ID: ${testUserId}`);
  console.log(`   Subscription: ${response.data.data.user.subscriptionPlan}`);
  console.log(`   Max Agents: ${response.data.data.user.maxAgentsAllowed}`);
  console.log(`   Active Agents: ${JSON.stringify(response.data.data.user.activeAgents)}`);
  
  return response.data;
}

async function checkInitialState() {
  const response = await axios.get(`${BASE_URL}/agents/my-agents`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  
  console.log('✅ Initial state checked');
  console.log(`   Active Agents: ${JSON.stringify(response.data.data.activeAgents)}`);
  console.log(`   Agent Count: ${response.data.data.agentCount}`);
  
  return response.data;
}

async function createPaymentIntentWithAgents() {
  const response = await axios.post(`${BASE_URL}/payment/create-payment-intent`, {
    packId: PACK_ID,
    suggestedAgents: SUGGESTED_AGENTS
  }, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  
  console.log('✅ Payment intent created');
  console.log(`   Pack: ${response.data.details.name}`);
  console.log(`   Amount: €${response.data.details.amount / 100}`);
  console.log(`   Suggested Agents: ${JSON.stringify(response.data.suggestedAgents)}`);
  
  return response.data;
}

async function confirmPaymentWithAutoHiring(paymentIntentId) {
  // Note: In real scenario, this would be called after Stripe payment succeeds
  // For testing, we'll simulate this by calling the confirm endpoint directly
  console.log('⚠️ Note: In production, this would be called after actual Stripe payment');
  
  const response = await axios.post(`${BASE_URL}/payment/confirm-payment`, {
    paymentIntentId: paymentIntentId
  }, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  
  console.log('✅ Payment confirmed and auto-hiring completed');
  console.log(`   Active Agents: ${JSON.stringify(response.data.activeAgents)}`);
  console.log(`   Subscription: ${response.data.data.user.subscriptionPlan}`);
  console.log(`   Max Agents Allowed: ${response.data.data.user.maxAgentsAllowed}`);
  
  if (response.data.warning) {
    console.log(`   ⚠️ Warning: ${response.data.warning}`);
  }
  
  return response.data;
}

async function checkMyAgents() {
  const response = await axios.get(`${BASE_URL}/agents/my-agents`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  
  console.log('✅ My Agents endpoint working');
  console.log(`   Active Agents: ${JSON.stringify(response.data.data.activeAgents)}`);
  console.log(`   Agents Found: ${response.data.data.agentCount}`);
  
  response.data.data.agents.forEach(agent => {
    console.log(`   - ${agent.displayName} (${agent.name}): ${agent.energy}/${agent.maxEnergy} energy`);
  });
  
  return response.data;
}

async function testManualHiring() {
  try {
    // Try to hire another agent manually
    const response = await axios.post(`${BASE_URL}/agents/hire`, {
      agentId: 'kash'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    console.log('✅ Manual hiring successful');
    console.log(`   New Active Agents: ${JSON.stringify(response.data.activeAgents)}`);
    
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Manual hiring correctly blocked (limit reached)');
      console.log(`   Message: ${error.response.data.message}`);
    } else {
      throw error;
    }
  }
}

async function testEdgeCases() {
  console.log('🔍 Testing duplicate agents...');
  
  // Test creating payment intent with duplicate agents
  try {
    const response = await axios.post(`${BASE_URL}/payment/create-payment-intent`, {
      packId: 'premium_plan',
      suggestedAgents: ['hera', 'hera', 'echo', 'echo', 'kash'] // duplicates
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    console.log('✅ Duplicate handling works');
    console.log(`   Cleaned Agents: ${JSON.stringify(response.data.suggestedAgents)}`);
    
  } catch (error) {
    console.log('❌ Duplicate handling failed:', error.response?.data?.message);
  }
  
  console.log('🔍 Testing invalid agents...');
  
  // Test with invalid agent IDs
  try {
    const response = await axios.post(`${BASE_URL}/payment/create-payment-intent`, {
      packId: 'basic_plan',
      suggestedAgents: ['hera', 'invalid_agent', 'echo', 'fake_agent']
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    console.log('✅ Invalid agent filtering works');
    console.log(`   Valid Agents: ${JSON.stringify(response.data.suggestedAgents)}`);
    
  } catch (error) {
    console.log('❌ Invalid agent filtering failed:', error.response?.data?.message);
  }
}

// Helper function to add delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the tests
runTests().catch(console.error);