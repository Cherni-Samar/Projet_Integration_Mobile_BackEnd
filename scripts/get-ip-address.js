#!/usr/bin/env node

const os = require('os');

function getCurrentIPAddress() {
  const interfaces = os.networkInterfaces();
  
  console.log('🌐 Available Network Interfaces:');
  console.log('================================');
  
  for (const interfaceName in interfaces) {
    const networkInterface = interfaces[interfaceName];
    
    networkInterface.forEach((details) => {
      if (details.family === 'IPv4' && !details.internal) {
        console.log(`📡 ${interfaceName}: ${details.address}`);
      }
    });
  }
  
  // Try to find the most likely IP address
  const possibleIPs = [];
  
  for (const interfaceName in interfaces) {
    const networkInterface = interfaces[interfaceName];
    
    networkInterface.forEach((details) => {
      if (details.family === 'IPv4' && !details.internal) {
        // Prioritize common local network ranges
        if (details.address.startsWith('192.168.') || 
            details.address.startsWith('10.') || 
            details.address.startsWith('172.')) {
          possibleIPs.push(details.address);
        }
      }
    });
  }
  
  console.log('\n🎯 Recommended IP addresses for Flutter app:');
  console.log('=============================================');
  
  if (possibleIPs.length > 0) {
    possibleIPs.forEach((ip, index) => {
      console.log(`${index + 1}. ${ip}`);
    });
    
    console.log(`\n✅ Most likely IP: ${possibleIPs[0]}`);
    console.log(`\n📱 Update your Flutter services to use: http://${possibleIPs[0]}:3000`);
  } else {
    console.log('❌ No suitable IP addresses found');
  }
  
  console.log('\n📋 Current configuration in Flutter:');
  console.log('====================================');
  console.log('Current IP: 192.168.8.44');
  console.log('Files to update:');
  console.log('- lib/utils/constants.dart');
  console.log('- lib/services/dexo_service.dart');
  console.log('- lib/services/agent_service.dart');
  console.log('- lib/services/echo_service.dart');
  console.log('- lib/services/hr_agent_service.dart');
  console.log('- lib/services/agent_mail_service.dart');
}

getCurrentIPAddress();