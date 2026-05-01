// Debug script to test the save functionality
require('dotenv').config();
const DexoAgent = require('./agents/DexoAgent');
const Document = require('./models/Document');

async function testSaveAndRetrieve() {
  console.log('🔍 Testing save and retrieve functionality...');
  
  const dexoAgent = new DexoAgent();
  
  // Test data
  const testDocument = {
    filename: 'test_finance_document.pdf',
    content: 'This is a test financial document with budget information and expense reports.',
    classification: {
      category: 'finance',
      subcategory: 'budget',
      confidentialityLevel: 'interne',
      suggestedName: 'budget_report_2024.pdf',
      tags: ['budget', 'finance', '2024'],
      accessRoles: ['employee', 'manager'],
      priority: 'medium',
      confidence: 0.9
    },
    userId: 'test_user',
    metadata: {
      source: 'debug_test',
      timestamp: new Date().toISOString()
    }
  };
  
  try {
    // 1. Test save
    console.log('💾 Testing save...');
    const saveResult = await dexoAgent.saveClassifiedDocument(
      testDocument.filename,
      testDocument.content,
      testDocument.classification,
      testDocument.userId,
      testDocument.metadata
    );
    
    console.log('Save result:', JSON.stringify(saveResult, null, 2));
    
    // 2. Test retrieve
    console.log('📂 Testing retrieve...');
    const retrieveResult = await dexoAgent.getDocumentsByCategory('finance', 'test_user', 10, 0);
    
    console.log('Retrieve result:', JSON.stringify(retrieveResult, null, 2));
    
    // 3. Check database directly
    console.log('🗄️ Checking database directly...');
    try {
      const dbDocuments = await Document.find({ category: 'finance' }).limit(5);
      console.log('Database documents:', dbDocuments.length);
      dbDocuments.forEach(doc => {
        console.log(`- ${doc.filename} (${doc.category})`);
      });
    } catch (dbError) {
      console.log('Database check failed:', dbError.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testSaveAndRetrieve().then(() => {
  console.log('✅ Test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});