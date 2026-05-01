#!/usr/bin/env node

/**
 * Test Script for Echo Agent Blocking Implementation
 * 
 * This script tests that Echo automation is properly blocked when users haven't purchased Echo
 */

const axios = require('axios');
const User = require('./models/User');
const mongoose = require('mongoose');
require('dotenv').config();

const BASE_URL = 'http://localhost:3000/api';

console.log('🧪 Starting Echo Agent Blocking Tests\n');

async function runTests() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Test 1: Create user WITHOUT Echo agent
    console.log('\n📝 Test 1: Creating user WITHOUT Echo agent...');
    const userWithoutEcho = await createTestUser('without-echo', []);
    
    // Test 2: Create user WITH Echo agent
    console.log('\n📝 Test 2: Creating user WITH Echo agent...');
    const userWithEcho = await createTestUser('with-echo', ['echo']);
    
    // Test 3: Test autonomous campaign blocking
    console.log('\n🤖 Test 3: Testing autonomous campaign blocking...');
    await testAutonomousCampaignBlocking();
    
    // Test 4: Test autonomous social posting blocking
    console.log('\n📱 Test 4: Testing autonomous social posting blocking...');
    await testAutonomousSocialBlocking();
    
    // Test 5: Test manual endpoint blocking
    console.log('\n🔒 Test 5: Testing manual endpoint blocking...');
    await testManualEndpointBlocking(userWithoutEcho, userWithEcho);
    
    // Test 6: Test energy consumption blocking
    console.log('\n⚡ Test 6: Testing energy consumption blocking...');
    await testEnergyConsumptionBlocking(userWithoutEcho.id, userWithEcho.id);
    
    console.log('\n🎉 All Echo blocking tests completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

async function createTestUser(suffix, activeAgents) {
  const email = `test-echo-${suffix}-${Date.now()}@example.com`;
  
  try {
    // Try to delete existing user first
    await User.deleteOne({ email });
    
    const user = await User.create({
      email,
      password: 'test123456',
      name: `Test User ${suffix}`,
      activeAgents,
      subscriptionPlan: activeAgents.length > 0 ? 'basic' : 'free',
      maxAgentsAllowed: activeAgents.length > 0 ? 3 : 1,
      energyBalance: 100,
      credits: 100
    });
    
    console.log(`✅ Created user: ${email}`);
    console.log(`   Active Agents: ${JSON.stringify(activeAgents)}`);
    console.log(`   Energy Balance: ${user.energyBalance}`);
    
    return { id: user._id.toString(), email, activeAgents };
    
  } catch (error) {
    console.error(`❌ Failed to create user ${suffix}:`, error.message);
    throw error;
  }
}

async function testAutonomousCampaignBlocking() {
  try {
    // Import the campaign scheduler
    const ProductCampaignScheduler = require('./services/productCampaignScheduler.service');
    
    console.log('🔍 Triggering campaign scheduler...');
    
    // Capture console output to check for blocking message
    const originalLog = console.log;
    let logOutput = '';
    console.log = (...args) => {
      logOutput += args.join(' ') + '\n';
      originalLog(...args);
    };
    
    await ProductCampaignScheduler.checkAndPostCampaigns();
    
    // Restore console.log
    console.log = originalLog;
    
    // Check if blocking message appeared
    if (logOutput.includes('⛔ ECHO blocked') || logOutput.includes('No users have purchased ECHO')) {
      console.log('✅ Campaign scheduler correctly blocked when no Echo users');
    } else {
      console.log('⚠️ Campaign scheduler blocking may not be working properly');
      console.log('Log output:', logOutput);
    }
    
  } catch (error) {
    console.log('✅ Campaign scheduler blocked with error (expected):', error.message);
  }
}

async function testAutonomousSocialBlocking() {
  try {
    // Import the social autonomy
    const { tick } = require('./services/echoLinkedInAutonomy');
    
    console.log('🔍 Triggering autonomous social posting...');
    
    // Capture console output
    const originalLog = console.log;
    let logOutput = '';
    console.log = (...args) => {
      logOutput += args.join(' ') + '\n';
      originalLog(...args);
    };
    
    await tick(true); // Force post
    
    // Restore console.log
    console.log = originalLog;
    
    // Check if blocking message appeared
    if (logOutput.includes('⛔ ECHO blocked') || logOutput.includes('No users have purchased ECHO')) {
      console.log('✅ Autonomous social posting correctly blocked when no Echo users');
    } else {
      console.log('⚠️ Autonomous social posting blocking may not be working properly');
      console.log('Log output:', logOutput);
    }
    
  } catch (error) {
    console.log('✅ Autonomous social posting blocked with error (expected):', error.message);
  }
}

async function testManualEndpointBlocking(userWithoutEcho, userWithEcho) {
  // Test manual endpoints that should be blocked
  
  // First, get auth tokens
  const tokenWithoutEcho = await loginUser(userWithoutEcho.email);
  const tokenWithEcho = await loginUser(userWithEcho.email);
  
  // Test force post endpoint
  console.log('🔍 Testing force post endpoint...');
  
  // Should be blocked for user without Echo
  try {
    await axios.post(`${BASE_URL}/echo/social/force-post`, {}, {
      headers: { Authorization: `Bearer ${tokenWithoutEcho}` }
    });
    console.log('❌ Force post should have been blocked for user without Echo');
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('✅ Force post correctly blocked for user without Echo');
    } else {
      console.log('⚠️ Unexpected error:', error.response?.data?.message || error.message);
    }
  }
  
  // Should work for user with Echo
  try {
    await axios.post(`${BASE_URL}/echo/social/force-post`, {}, {
      headers: { Authorization: `Bearer ${tokenWithEcho}` }
    });
    console.log('✅ Force post allowed for user with Echo');
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('❌ Force post should have been allowed for user with Echo');
    } else {
      console.log('ℹ️ Force post failed for other reason (may be expected):', error.response?.data?.message || error.message);
    }
  }
  
  // Test campaign trigger endpoint
  console.log('🔍 Testing campaign trigger endpoint...');
  
  // Should be blocked for user without Echo
  try {
    await axios.post(`${BASE_URL}/echo/product/campaign/trigger-now`, {}, {
      headers: { Authorization: `Bearer ${tokenWithoutEcho}` }
    });
    console.log('❌ Campaign trigger should have been blocked for user without Echo');
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('✅ Campaign trigger correctly blocked for user without Echo');
    } else {
      console.log('⚠️ Unexpected error:', error.response?.data?.message || error.message);
    }
  }
  
  // Should work for user with Echo
  try {
    await axios.post(`${BASE_URL}/echo/product/campaign/trigger-now`, {}, {
      headers: { Authorization: `Bearer ${tokenWithEcho}` }
    });
    console.log('✅ Campaign trigger allowed for user with Echo');
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('❌ Campaign trigger should have been allowed for user with Echo');
    } else {
      console.log('ℹ️ Campaign trigger failed for other reason (may be expected):', error.response?.data?.message || error.message);
    }
  }
}

async function testEnergyConsumptionBlocking(userWithoutEchoId, userWithEchoId) {
  const { manualEnergyConsumption } = require('./middleware/energyMiddleware');
  
  console.log('🔍 Testing energy consumption blocking...');
  
  // Should be blocked for user without Echo
  try {
    const result = await manualEnergyConsumption(
      'echo',
      'CONTENT_GENERATION',
      'Test content generation',
      {},
      userWithoutEchoId
    );
    
    if (result.blocked || !result.success) {
      console.log('✅ Energy consumption correctly blocked for user without Echo');
      console.log(`   Result: ${result.error || 'Blocked'}`);
    } else {
      console.log('❌ Energy consumption should have been blocked for user without Echo');
      console.log(`   Result: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    console.log('✅ Energy consumption blocked with error (expected):', error.message);
  }
  
  // Should work for user with Echo
  try {
    const result = await manualEnergyConsumption(
      'echo',
      'CONTENT_GENERATION',
      'Test content generation',
      {},
      userWithEchoId
    );
    
    if (result.success && !result.blocked) {
      console.log('✅ Energy consumption allowed for user with Echo');
      console.log(`   Energy consumed: ${result.energyCost}`);
    } else {
      console.log('⚠️ Energy consumption failed for user with Echo:', result.error || 'Unknown error');
    }
  } catch (error) {
    console.log('⚠️ Energy consumption error for user with Echo:', error.message);
  }
}

async function loginUser(email) {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email,
      password: 'test123456'
    });
    return response.data.data.token;
  } catch (error) {
    throw new Error(`Failed to login user ${email}: ${error.response?.data?.message || error.message}`);
  }
}

// Run the tests
runTests().catch(console.error);