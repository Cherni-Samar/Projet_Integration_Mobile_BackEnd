// Simple server startup script
console.log('🚀 Starting E-Team Backend Server...');
console.log('📍 Make sure MongoDB is running');
console.log('📍 Make sure .env file is configured');
console.log('');

// Check if required files exist
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  '.env',
  'models/Agent.js',
  'models/ActivityLog.js',
  'services/activityLogger.service.js',
  'controllers/activityLogController.js',
  'routes/activityRoutes.js'
];

console.log('🔍 Checking required files...');
let allFilesExist = true;

requiredFiles.forEach(file => {
  if (fs.existsSync(path.join(__dirname, file))) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING!`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.log('\n❌ Some required files are missing. Please check the file structure.');
  process.exit(1);
}

console.log('\n✅ All required files found!');
console.log('\n🚀 Starting server with app.js...');

// Start the main app
require('./app.js');