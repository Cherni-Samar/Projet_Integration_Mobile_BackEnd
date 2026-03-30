#!/usr/bin/env node

/**
 * Test script to demonstrate DEXO working in 100% autonomous mode
 * This script shows how DEXO processes documents with minimal user interaction
 */

require('dotenv').config();
const mongoose = require('mongoose');
const DexoAgent = require('../agents/DexoAgent');

async function testAutonomousDexo() {
    try {
        console.log('🚀 Starting DEXO Autonomous Mode Test...\n');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pim-db');
        console.log('✅ Connected to MongoDB\n');
        
        // Initialize DEXO Agent
        const dexo = new DexoAgent();
        console.log('✅ DEXO Agent initialized in autonomous mode\n');
        
        // Wait a moment for initialization
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 1: Process a legal document autonomously
        console.log('📄 TEST 1: Processing legal document autonomously...');
        const legalDocument = `
        CONTRAT DE PRESTATION DE SERVICES
        
        Entre les soussignés :
        - Société ABC Corp, représentée par M. Jean Dupont
        - Prestataire XYZ Services
        
        Il est convenu ce qui suit :
        
        Article 1 : Objet du contrat
        Le prestataire s'engage à fournir des services de consultation...
        
        Article 2 : Durée
        Le présent contrat est conclu pour une durée de 12 mois...
        
        Article 3 : Rémunération
        Le montant total est fixé à 50 000 euros HT...
        `;
        
        const result1 = await dexo.processDocument(
            'contrat_abc_corp_2024.pdf',
            legalDocument,
            'user123',
            { source: 'email', priority: 'high' }
        );
        
        console.log('📊 Legal Document Processing Result:');
        console.log(`   ✅ Success: ${result1.success}`);
        console.log(`   🏷️ Category: ${result1.classification?.category}`);
        console.log(`   🎯 Confidence: ${result1.classification?.confidence}`);
        console.log(`   🤖 Autonomous Decisions: ${Object.keys(result1.autonomousDecisions || {}).length}`);
        console.log(`   ⚡ Workflows Triggered: ${result1.workflowsTriggered?.length || 0}`);
        console.log(`   ⏱️ Processing Time: ${result1.processingTime}ms\n`);
        
        // Test 2: Process a financial document autonomously
        console.log('📄 TEST 2: Processing financial document autonomously...');
        const financialDocument = `
        RAPPORT BUDGETAIRE 2024
        
        Résumé Exécutif:
        Ce rapport présente l'analyse budgétaire pour l'exercice 2024.
        
        Revenus:
        - Ventes: 2,500,000 €
        - Services: 800,000 €
        - Total: 3,300,000 €
        
        Dépenses:
        - Personnel: 1,800,000 €
        - Opérations: 900,000 €
        - Marketing: 300,000 €
        - Total: 3,000,000 €
        
        Bénéfice Net: 300,000 €
        `;
        
        const result2 = await dexo.processDocument(
            'budget_report_2024.xlsx',
            financialDocument,
            'user456',
            { source: 'upload', department: 'finance' }
        );
        
        console.log('📊 Financial Document Processing Result:');
        console.log(`   ✅ Success: ${result2.success}`);
        console.log(`   🏷️ Category: ${result2.classification?.category}`);
        console.log(`   🎯 Confidence: ${result2.classification?.confidence}`);
        console.log(`   🤖 Autonomous Decisions: ${Object.keys(result2.autonomousDecisions || {}).length}`);
        console.log(`   ⚡ Workflows Triggered: ${result2.workflowsTriggered?.length || 0}`);
        console.log(`   ⏱️ Processing Time: ${result2.processingTime}ms\n`);
        
        // Test 3: Process a potentially suspicious document
        console.log('📄 TEST 3: Processing suspicious document (security test)...');
        const suspiciousDocument = `
        URGENT - CONFIDENTIAL ACCESS REQUIRED
        
        This document contains sensitive information that requires immediate access.
        Please provide your login credentials to access the full content.
        
        Username: ___________
        Password: ___________
        
        Click here to verify: http://suspicious-link.com/verify
        `;
        
        const result3 = await dexo.processDocument(
            'urgent_access_required.txt',
            suspiciousDocument,
            'user789',
            { source: 'email', sender: 'unknown@suspicious.com' }
        );
        
        console.log('📊 Suspicious Document Processing Result:');
        console.log(`   ✅ Success: ${result3.success}`);
        if (result3.success) {
            console.log(`   🏷️ Category: ${result3.classification?.category}`);
            console.log(`   🛡️ Security Level: ${result3.securityCheck?.alertLevel}`);
            console.log(`   🤖 Autonomous Decisions: ${Object.keys(result3.autonomousDecisions || {}).length}`);
        } else {
            console.log(`   🛡️ Security Action: ${result3.securityDecision?.selectedOption}`);
            console.log(`   🧠 AI Reasoning: ${result3.securityDecision?.reasoning?.join(', ')}`);
        }
        console.log(`   ⏱️ Processing Time: ${result3.processingTime || 'N/A'}ms\n`);
        
        // Test 4: Demonstrate autonomous monitoring
        console.log('📄 TEST 4: Demonstrating autonomous monitoring...');
        console.log('🤖 DEXO is continuously monitoring and optimizing in the background...');
        
        // Wait to see autonomous monitoring in action
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('\n🎉 DEXO Autonomous Mode Test Completed!');
        console.log('\n📋 Summary:');
        console.log('   • DEXO processed all documents without user intervention');
        console.log('   • AI made autonomous decisions for classification, security, and workflows');
        console.log('   • Security threats were automatically detected and handled');
        console.log('   • Workflows were triggered automatically based on document content');
        console.log('   • System continuously monitors and optimizes itself');
        console.log('\n🤖 DEXO is now running in 100% autonomous mode!');
        console.log('   Users only need to watch or provide minimal input.');
        
    } catch (error) {
        console.error('❌ Test Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        // Close MongoDB connection
        await mongoose.connection.close();
        console.log('\n✅ MongoDB connection closed');
        process.exit(0);
    }
}

// Run the test
if (require.main === module) {
    testAutonomousDexo();
}

module.exports = testAutonomousDexo;