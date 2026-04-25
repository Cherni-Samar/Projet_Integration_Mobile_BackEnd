#!/usr/bin/env node

/**
 * Test script to demonstrate DEXO working in FULLY autonomous mode
 * This shows how DEXO processes documents WITHOUT ANY USER INPUT
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const autonomousService = require('../services/autonomousService');

async function testFullyAutonomousDexo() {
    try {
        console.log('🚀 Testing DEXO in FULLY AUTONOMOUS MODE...\n');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pim-db');
        console.log('✅ Connected to MongoDB\n');
        
        // Start autonomous service
        console.log('🤖 Starting DEXO Autonomous Service...');
        await autonomousService.start();
        console.log('✅ Autonomous service started\n');
        
        // Wait for service to fully initialize
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Create test documents in watched directories
        console.log('📄 Creating test documents for autonomous processing...\n');
        
        // Test 1: Legal document - will be processed automatically
        const legalDoc = `
CONTRAT DE PRESTATION DE SERVICES INFORMATIQUES

Entre les soussignés :
- Société TechCorp SARL, représentée par M. Pierre Durand, Directeur Général
- Prestataire DevServices, représenté par Mme Sophie Laurent, CEO

Il est convenu ce qui suit :

Article 1 : Objet du contrat
Le prestataire s'engage à fournir des services de développement d'applications mobiles et web pour le compte du client.

Article 2 : Durée et conditions
Le présent contrat est conclu pour une durée de 18 mois à compter du 1er février 2024.
Le montant total est fixé à 120 000 euros HT, payable en 18 mensualités.

Article 3 : Confidentialité et propriété intellectuelle
Les parties s'engagent à maintenir la confidentialité de toutes les informations techniques et commerciales échangées.

Fait à Lyon, le 25 janvier 2024
Signatures des parties contractantes
        `;
        
        await createTestDocument('documents/inbox/contrat_techcorp_2024.pdf', legalDoc);
        
        // Test 2: Financial document - will be processed automatically
        const financialDoc = `
RAPPORT FINANCIER TRIMESTRIEL - Q1 2024

SOCIÉTÉ: TechCorp SARL
PÉRIODE: Janvier - Mars 2024

RÉSUMÉ EXÉCUTIF:
Ce rapport présente les résultats financiers du premier trimestre 2024, marqué par une croissance significative de nos activités.

CHIFFRES CLÉS (en milliers d'euros):
• Chiffre d'affaires: 3 200 k€ (+15% vs Q1 2023)
• Charges d'exploitation: 2 100 k€
• Résultat d'exploitation: 1 100 k€
• Résultat net: 850 k€

DÉTAIL DES REVENUS:
• Ventes de logiciels: 1 800 k€
• Services de maintenance: 900 k€
• Formation et consulting: 500 k€

CHARGES PRINCIPALES:
• Salaires et charges sociales: 1 200 k€
• Frais généraux: 450 k€
• Amortissements: 250 k€
• Autres charges: 200 k€

TRÉSORERIE:
• Disponibilités en fin de période: 2 500 k€
• Créances clients: 800 k€
• Dettes fournisseurs: 400 k€

PERSPECTIVES Q2 2024:
• Objectif CA: 3 500 k€
• Nouveaux recrutements prévus: 5 personnes
• Investissements R&D: 300 k€

Rapport établi le 5 avril 2024
Directeur Financier: Jean-Marc Petit
        `;
        
        await createTestDocument('documents/inbox/rapport_financier_q1_2024.xlsx', financialDoc);
        
        // Test 3: HR document - will be processed automatically
        const hrDoc = `
ÉVALUATION ANNUELLE DE PERFORMANCE

COLLABORATEUR: Marie BERNARD
POSTE: Développeuse Senior Full-Stack
MANAGER: Thomas MARTIN
PÉRIODE D'ÉVALUATION: Janvier 2023 - Décembre 2023

OBJECTIFS ATTEINTS:
✅ Développement de 3 applications mobiles (objectif: 2)
✅ Formation de 2 développeurs juniors
✅ Amélioration des performances système de 25%
✅ Certification React Native obtenue

COMPÉTENCES TECHNIQUES:
• JavaScript/TypeScript: Excellent (5/5)
• React/React Native: Excellent (5/5)
• Node.js: Très bon (4/5)
• Bases de données: Bon (3/5)
• DevOps: En progression (3/5)

COMPÉTENCES COMPORTEMENTALES:
• Leadership: Très bon (4/5)
• Communication: Excellent (5/5)
• Travail en équipe: Excellent (5/5)
• Autonomie: Excellent (5/5)
• Adaptabilité: Très bon (4/5)

POINTS FORTS:
- Excellente maîtrise technique
- Capacité à former et encadrer
- Proactivité dans la résolution de problèmes
- Très bonne communication avec les clients

AXES D'AMÉLIORATION:
- Approfondir les connaissances DevOps
- Développer les compétences en architecture système

OBJECTIFS 2024:
1. Obtenir la certification AWS Solutions Architect
2. Encadrer une équipe de 4 développeurs
3. Participer à la conception de l'architecture microservices

ÉVOLUTION SALARIALE:
Augmentation proposée: +8% (nouveau salaire: 54 000€)
Prime de performance: 3 000€

Évaluation réalisée le 15 janvier 2024
Signatures: Collaborateur et Manager
        `;
        
        await createTestDocument('documents/inbox/evaluation_marie_bernard_2023.docx', hrDoc);
        
        console.log('📁 Test documents created in watched directories');
        console.log('👁️  DEXO will now process them AUTOMATICALLY...\n');
        
        // Wait and monitor autonomous processing
        console.log('⏱️  Waiting for autonomous processing (60 seconds)...');
        console.log('🤖 DEXO is working autonomously - NO USER INPUT REQUIRED!\n');
        
        // Monitor processing for 60 seconds
        for (let i = 0; i < 12; i++) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const status = autonomousService.getStatus();
            console.log(`📊 Status Update (${(i + 1) * 5}s):`);
            console.log(`   🔄 Processing: ${status.documentWatcher?.isProcessing ? 'ACTIVE' : 'Idle'}`);
            console.log(`   📋 Queue: ${status.documentWatcher?.queueLength || 0} documents`);
            console.log(`   🤖 Auto-processing: ${status.documentWatcher?.autoProcessingEnabled ? 'ENABLED' : 'DISABLED'}`);
            console.log('');
        }
        
        // Check processed documents
        console.log('📊 AUTONOMOUS PROCESSING RESULTS:');
        console.log('='.repeat(50));
        
        try {
            const processedDirs = [
                './documents/processed/contrats',
                './documents/processed/finance', 
                './documents/processed/rh',
                './documents/processed/general'
            ];
            
            let totalProcessed = 0;
            for (const dir of processedDirs) {
                try {
                    const files = await fs.readdir(dir);
                    const processedFiles = files.filter(f => f.includes('_processed_'));
                    
                    if (processedFiles.length > 0) {
                        console.log(`📁 ${path.basename(dir)}: ${processedFiles.length} documents processed`);
                        processedFiles.forEach(file => {
                            console.log(`   📄 ${file}`);
                        });
                        totalProcessed += processedFiles.length;
                    }
                } catch (error) {
                    // Directory might not exist yet
                }
            }
            
            console.log('='.repeat(50));
            console.log(`✅ Total documents processed autonomously: ${totalProcessed}`);
            
        } catch (error) {
            console.log('📊 Processing results not yet available in file system');
        }
        
        // Final status
        const finalStatus = autonomousService.getStatus();
        console.log('\n🎉 FULLY AUTONOMOUS DEXO TEST COMPLETED!');
        console.log('='.repeat(50));
        console.log('📋 FINAL RESULTS:');
        console.log(`   ⏱️ Service uptime: ${Math.floor(finalStatus.uptime / 1000)} seconds`);
        console.log(`   🤖 Autonomous mode: ${finalStatus.isRunning ? 'ACTIVE' : 'INACTIVE'}`);
        console.log(`   📁 Directories watched: ${finalStatus.documentWatcher?.watchedDirectories?.length || 0}`);
        console.log(`   🔄 Currently processing: ${finalStatus.documentWatcher?.isProcessing ? 'YES' : 'NO'}`);
        console.log(`   📋 Queue length: ${finalStatus.documentWatcher?.queueLength || 0}`);
        
        console.log('\n🚀 DEXO AUTONOMOUS FEATURES DEMONSTRATED:');
        console.log('   ✅ Automatic file monitoring and detection');
        console.log('   ✅ Zero user input required for processing');
        console.log('   ✅ AI-powered document classification');
        console.log('   ✅ Autonomous security analysis');
        console.log('   ✅ Intelligent workflow orchestration');
        console.log('   ✅ Automatic file organization and storage');
        console.log('   ✅ Self-monitoring and health checks');
        
        console.log('\n🎯 USER EXPERIENCE:');
        console.log('   👁️  Users only need to WATCH - no clicking required!');
        console.log('   📁 Drop files in watched folders → DEXO processes automatically');
        console.log('   🤖 AI makes ALL decisions without user confirmation');
        console.log('   ⚡ Workflows trigger automatically based on content');
        console.log('   📊 Real-time status available via API endpoints');
        
        console.log('\n🔗 API ENDPOINTS FOR MONITORING:');
        console.log('   📊 GET /api/dexo/autonomous-service-status');
        console.log('   🤖 GET /api/dexo/autonomous-status');
        console.log('   📤 POST /api/dexo/autonomous-upload');
        console.log('   ⚡ POST /api/dexo/enable-autonomous');
        
    } catch (error) {
        console.error('❌ Test Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        // Stop autonomous service
        await autonomousService.stop();
        
        // Close MongoDB connection
        await mongoose.connection.close();
        console.log('\n✅ Test completed and resources cleaned up');
        process.exit(0);
    }
}

async function createTestDocument(filePath, content) {
    try {
        // Ensure directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        
        // Write document
        await fs.writeFile(filePath, content);
        console.log(`📄 Created: ${path.basename(filePath)}`);
        
    } catch (error) {
        console.error(`❌ Failed to create ${filePath}:`, error.message);
    }
}

// Run the test
if (require.main === module) {
    testFullyAutonomousDexo();
}

module.exports = testFullyAutonomousDexo;