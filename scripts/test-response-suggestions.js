#!/usr/bin/env node

// =============================================================
//  TEST SCRIPT - Response Suggestions Feature
//  Tests the new automatic response suggestions functionality
// =============================================================

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testResponseSuggestions() {
  console.log('🧪 Testing Response Suggestions Feature...\n');

  const testCases = [
    {
      name: 'Budget Report Email',
      message: `Bonjour,

Veuillez trouver ci-joint le rapport budgétaire annuel 2024 présentant les revenus, charges et résultat net de l'entreprise.

REVENUS
- Ventes produits : 2 500 000€
- Prestations services : 800 000€
- Autres revenus : 150 000€
TOTAL REVENUS : 3 450 000€

CHARGES
- Salaires et charges : 1 800 000€
- Achats matières : 650 000€
- Frais généraux : 400 000€
- Amortissements : 200 000€
TOTAL CHARGES : 3 050 000€

RÉSULTAT NET : 400 000€

ANALYSE
Le résultat est en hausse de 15% par rapport à 2023.
Les investissements en R&D représentent 8% du CA.

Établi le 31/12/2024
Validé par le Directeur Financier

Cordialement,
Service Comptabilité`,
      sender: 'comptabilite@entreprise.com'
    },
    {
      name: 'Urgent Technical Issue',
      message: 'URGENT: Le serveur principal est tombé en panne. Tous les services sont indisponibles. Besoin d\'intervention immédiate!',
      sender: 'admin@entreprise.com'
    },
    {
      name: 'Meeting Request',
      message: 'Bonjour, pourriez-vous me confirmer votre disponibilité pour une réunion demain à 14h concernant le projet Alpha?',
      sender: 'manager@entreprise.com'
    }
  ];

  for (const testCase of testCases) {
    console.log(`📧 Testing: ${testCase.name}`);
    console.log(`From: ${testCase.sender}`);
    console.log(`Message: ${testCase.message.substring(0, 100)}...`);
    
    try {
      const response = await fetch(`${BASE_URL}/api/echo/response-suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: testCase.message,
          sender: testCase.sender,
          context: {
            subject: testCase.name,
            timestamp: new Date().toISOString()
          }
        }),
      });

      const result = await response.json();
      
      if (result.success && result.suggestions) {
        console.log('✅ Response suggestions generated successfully!');
        console.log(`📊 Number of suggestions: ${result.suggestions.length}`);
        
        result.suggestions.forEach((suggestion, index) => {
          console.log(`\n${index + 1}. ${suggestion.title} (${suggestion.type})`);
          console.log(`   "${suggestion.content}"`);
        });
      } else {
        console.log('❌ Failed to generate suggestions:', result.error);
      }
      
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
    
    console.log('\n' + '─'.repeat(80) + '\n');
  }
}

async function testHealthCheck() {
  console.log('🏥 Testing Health Check...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/echo/sante`);
    const result = await response.json();
    
    console.log('✅ Echo Agent Health Check:');
    console.log(`Status: ${result.status}`);
    console.log(`Features: ${result.fonctionnalites.length} available`);
    console.log(`Endpoints: ${result.endpoints.length} available`);
    
    // Check if response-suggestions is listed
    const hasSuggestions = result.endpoints.some(endpoint => 
      endpoint.includes('response-suggestions')
    );
    
    if (hasSuggestions) {
      console.log('✅ Response suggestions endpoint is registered');
    } else {
      console.log('❌ Response suggestions endpoint not found in health check');
    }
    
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting Response Suggestions Tests\n');
  
  await testHealthCheck();
  console.log('\n' + '='.repeat(80) + '\n');
  
  await testResponseSuggestions();
  
  console.log('🎉 Tests completed!');
}

// Run the tests
main().catch(console.error);