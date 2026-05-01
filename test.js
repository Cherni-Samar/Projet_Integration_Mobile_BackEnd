console.log('Test 1: Script started');
require('dotenv').config();
console.log('Test 2: Dotenv loaded');
console.log('Test 3: MONGODB_URI =', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('Test 4: All good');
