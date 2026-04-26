// force-campaign-now.js
// Force the existing campaign to post immediately by updating nextPostAt
require('dotenv').config();
const mongoose = require('mongoose');

async function forceCampaignNow() {
  try {
    console.log('🔥 FORCE CAMPAIGN TO POST NOW');
    console.log('='.repeat(70));
    
    // Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    const ProductCampaign = require('./models/ProductCampaign');
    
    // Find active campaigns
    const campaigns = await ProductCampaign.find({ status: 'active' });
    console.log(`📋 Found ${campaigns.length} active campaign(s)\n`);
    
    if (campaigns.length === 0) {
      console.log('❌ No active campaigns found');
      process.exit(1);
    }
    
    // Update all campaigns to post now
    for (const campaign of campaigns) {
      console.log(`🔧 Updating campaign: ${campaign.productData.title}`);
      console.log(`   Current nextPostAt: ${campaign.nextPostAt}`);
      
      campaign.nextPostAt = new Date(); // Set to now
      await campaign.save();
      
      console.log(`   New nextPostAt: ${campaign.nextPostAt}`);
      console.log(`   ✅ Updated!\n`);
    }
    
    console.log('='.repeat(70));
    console.log('✅ ALL CAMPAIGNS UPDATED TO POST NOW!');
    console.log('='.repeat(70));
    console.log('\n🚀 Now trigger the campaign:');
    console.log('   curl -X POST http://localhost:3000/api/echo/product/campaign/trigger-now\n');
    console.log('📊 Or check from mobile app - campaigns are ready to post!\n');
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

forceCampaignNow();
