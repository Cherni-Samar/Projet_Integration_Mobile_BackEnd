#!/usr/bin/env node

// =============================================================
//  TEST SCRIPT - Task Extraction Feature
//  Tests the new task extraction and management functionality
// =============================================================

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testTaskExtraction() {
  console.log('🧪 Testing Task Extraction Feature...\n');

  const testEmails = [
    {
      subject: 'Budget Report Review',
      sender: 'comptabilite@entreprise.com',
      content: `Bonjour,

Veuillez trouver ci-joint le rapport budgétaire annuel 2024.

Actions requises:
- Réviser le rapport avant vendredi
- Analyser les résultats du Q4
- Organiser une réunion avec l'équipe finance
- Préparer la présentation pour le conseil d'administration

Le rapport doit être validé avant la fin de la semaine.

Cordialement,
Service Comptabilité`
    },
    {
      subject: 'Urgent: Server Issues',
      sender: 'admin@entreprise.com',
      content: `URGENT: Le serveur principal est tombé en panne.

À faire immédiatement:
- Redémarrer le serveur de base de données
- Vérifier les logs d'erreur
- Contacter l'équipe technique
- Informer tous les utilisateurs
- Mettre en place une solution de secours

Deadline: Dans les 2 heures maximum!`
    },
    {
      subject: 'Project Alpha Planning',
      sender: 'manager@entreprise.com',
      content: `Bonjour l'équipe,

Pour le projet Alpha, nous devons:

1. Finaliser les spécifications techniques (Jean - avant mardi)
2. Créer les maquettes UI/UX (Marie - fin de semaine)
3. Configurer l'environnement de développement (Paul)
4. Planifier les tests utilisateurs
5. Organiser une réunion de suivi jeudi à 14h

Merci de confirmer votre disponibilité.`
    }
  ];

  for (const email of testEmails) {
    console.log(`📧 Testing: ${email.subject}`);
    console.log(`From: ${email.sender}`);
    
    try {
      // Test task extraction and saving
      const response = await fetch(`${BASE_URL}/api/echo/extract-save-tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: email.content,
          sender: email.sender,
          subject: email.subject,
          emailId: `test_${Date.now()}`
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ ${result.message}`);
        console.log(`📊 Tasks extracted: ${result.totalExtracted}`);
        console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        
        if (result.tasks && result.tasks.length > 0) {
          console.log('\n📋 Extracted Tasks:');
          result.tasks.forEach((task, index) => {
            console.log(`  ${index + 1}. ${task.title}`);
            console.log(`     📝 ${task.description}`);
            console.log(`     🏷️  Category: ${task.category}`);
            console.log(`     ⭐ Priority: ${task.priority}`);
            if (task.assignee) {
              console.log(`     👤 Assignee: ${task.assignee}`);
            }
            if (task.deadline) {
              console.log(`     ⏰ Deadline: ${task.deadline}`);
            }
            console.log('');
          });
        }
      } else {
        console.log('❌ Failed to extract tasks:', result.error);
      }
      
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
    
    console.log('\n' + '─'.repeat(80) + '\n');
  }
}

async function testTaskManagement() {
  console.log('📋 Testing Task Management...\n');
  
  try {
    // Get all tasks
    console.log('📋 Fetching all tasks...');
    const response = await fetch(`${BASE_URL}/api/echo/tasks`);
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Found ${result.totalTasks} tasks`);
      console.log(`📊 Stats: ${result.stats.todo} todo, ${result.stats.in_progress} in progress, ${result.stats.completed} completed, ${result.stats.overdue} overdue`);
      
      if (result.tasks.length > 0) {
        const firstTask = result.tasks[0];
        console.log(`\n🔄 Testing status update for task: ${firstTask.title}`);
        
        // Update task status
        const updateResponse = await fetch(`${BASE_URL}/api/echo/tasks/${firstTask._id}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'in_progress'
          }),
        });
        
        const updateResult = await updateResponse.json();
        
        if (updateResult.success) {
          console.log('✅ Task status updated successfully');
        } else {
          console.log('❌ Failed to update task status:', updateResult.error);
        }
      }
    } else {
      console.log('❌ Failed to fetch tasks:', result.error);
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
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
    
    // Check if task management endpoints are listed
    const hasTaskEndpoints = result.endpoints.some(endpoint => 
      endpoint.includes('extract-save-tasks') || endpoint.includes('tasks')
    );
    
    if (hasTaskEndpoints) {
      console.log('✅ Task management endpoints are registered');
    } else {
      console.log('❌ Task management endpoints not found in health check');
    }
    
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting Task Extraction Tests\n');
  
  await testHealthCheck();
  console.log('\n' + '='.repeat(80) + '\n');
  
  await testTaskExtraction();
  console.log('\n' + '='.repeat(80) + '\n');
  
  await testTaskManagement();
  
  console.log('\n🎉 Tests completed!');
}

// Run the tests
main().catch(console.error);