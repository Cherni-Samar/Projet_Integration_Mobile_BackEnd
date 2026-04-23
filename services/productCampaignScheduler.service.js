const cron = require('node-cron');
const ProductCampaign = require('../models/ProductCampaign');
const ProductMarketingGenerator = require('./productMarketingGenerator.service');
const linkedinService = require('./linkedin.service');
const SocialPost = require('../models/SocialPost');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class ProductCampaignScheduler {
  static async checkAndPostCampaigns() {
    try {
      console.log('🔍 [CAMPAIGN] Checking for campaigns ready to post...');
      
      const readyToPost = await ProductCampaign.getReadyToPost();
      
      if (readyToPost.length === 0) {
        console.log('⏳ [CAMPAIGN] No campaigns ready to post yet');
        return;
      }
      
      console.log(`📢 [CAMPAIGN] Found ${readyToPost.length} campaign(s) ready to post`);
      
      for (const campaign of readyToPost) {
        await this.postCampaign(campaign);
      }
      
    } catch (error) {
      console.error('❌ [CAMPAIGN] Error checking campaigns:', error.message);
    }
  }
  
  static async postCampaign(campaign) {
    try {
      console.log(`🚀 [CAMPAIGN] Posting campaign: ${campaign.productData.title}`);
      console.log(`📋 [CAMPAIGN] Platforms configured: ${campaign.platforms.join(', ')}`);
      console.log(`🔗 [CAMPAIGN] Product URL: ${campaign.productUrl}`);
      
      const sessionInfo = linkedinService.getSessionInfo();
      console.log(`🔐 [CAMPAIGN] LinkedIn auth status: ${sessionInfo.hasAccessToken ? '✅ Authenticated' : '❌ Not authenticated'}`);
      if (!sessionInfo.hasAccessToken && campaign.platforms.includes('linkedin')) {
        console.warn('⚠️  [CAMPAIGN] LinkedIn is in platforms but not authenticated! Will only post to other platforms.');
      }
      
      const postResult = await ProductMarketingGenerator.generateMarketingPost(
        campaign.productData,
        campaign.settings.includeImage
      );
      
      const postText = postResult.text || postResult;
      const imageUrl = postResult.image;
      
      let imageBuffer = null;
      if (imageUrl) {
        try {
          if (imageUrl.startsWith('/social-images/')) {
            console.log(`📂 [CAMPAIGN] Reading image from filesystem: ${imageUrl}`);
            const absolutePath = path.join(__dirname, '../public', imageUrl);
            imageBuffer = await fs.readFile(absolutePath);
            console.log(`✅ [CAMPAIGN] Image read from filesystem (${imageBuffer.length} bytes)`);
          } else {
            console.log(`📥 [CAMPAIGN] Downloading image from: ${imageUrl}`);
            const response = await axios.get(imageUrl, { 
              responseType: 'arraybuffer',
              timeout: 10000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            imageBuffer = Buffer.from(response.data);
            console.log(`✅ [CAMPAIGN] Image downloaded successfully (${imageBuffer.length} bytes)`);
          }
          
          const maxSize = 5 * 1024 * 1024;
          if (imageBuffer.length > maxSize) {
            console.warn(`⚠️ [CAMPAIGN] Image too large (${imageBuffer.length} bytes), posting without image`);
            imageBuffer = null;
          }
        } catch (imgError) {
          console.warn('⚠️ [CAMPAIGN] Failed to get image:', imgError.message);
          console.warn('   Will post without image');
          imageBuffer = null;
        }
      } else {
        console.log('ℹ️  [CAMPAIGN] No image URL provided, posting text only');
      }
      
      const results = {};
      
      console.log(`📝 [CAMPAIGN] Post content length: ${postText.length} characters`);
      console.log(`🖼️  [CAMPAIGN] Image status: ${imageBuffer ? `✅ Ready (${imageBuffer.length} bytes)` : '❌ No image'}`);
      
      for (const platform of campaign.platforms) {
        try {
          if (platform === 'linkedin') {
            console.log('📤 [CAMPAIGN] Attempting to post to LinkedIn...');
            console.log(`   With image: ${imageBuffer ? 'YES' : 'NO'}`);
            results.linkedin = await linkedinService.post(postText, imageBuffer);
            
            if (results.linkedin.success) {
              console.log(`✅ [CAMPAIGN] Posted to LinkedIn successfully`);
              console.log(`   Post ID: ${results.linkedin.postId || 'N/A'}`);
            } else {
              console.error(`❌ [CAMPAIGN] LinkedIn post failed: ${results.linkedin.error}`);
            }
          } else if (platform === 'mastodon') {
            console.log('📤 [CAMPAIGN] Attempting to post to Mastodon...');
            const mastodonService = require('./mastodon.service');
            results.mastodon = await mastodonService.post(postText, imageBuffer, 'campaign_image.jpg');
            
            if (results.mastodon.success) {
              console.log(`✅ [CAMPAIGN] Posted to Mastodon successfully`);
              console.log(`   Post URL: ${results.mastodon.url || 'N/A'}`);
            } else {
              console.error(`❌ [CAMPAIGN] Mastodon post failed: ${results.mastodon.error}`);
            }
          }
        } catch (error) {
          results[platform] = { success: false, error: error.message };
          console.error(`❌ [CAMPAIGN] Failed to post to ${platform}:`, error.message);
          console.error(`   Full error:`, error.response?.data || error);
        }
      }
      
      try {
        const platforms = [];
        
        if (results.linkedin) {
          platforms.push({
            name: 'linkedin',
            postId: results.linkedin.postId || null,
            url: results.linkedin.postUrl || null,
            status: results.linkedin.success ? 'success' : 'failed',
            error: results.linkedin.error || null,
            publishedAt: results.linkedin.success ? new Date() : null
          });
        }
        
        if (results.mastodon) {
          platforms.push({
            name: 'mastodon',
            postId: results.mastodon.postId || null,
            url: results.mastodon.url || null,
            status: results.mastodon.success ? 'success' : 'failed',
            error: results.mastodon.error || null,
            publishedAt: results.mastodon.success ? new Date() : null
          });
        }
        
        const hashtags = postText.match(/#\w+/g) || [];
        
        await SocialPost.create({
          content: postText,
          image: imageUrl ? {
            url: imageUrl,
            type: 'ai-generated',
            source: 'campaign'
          } : undefined,
          platforms: platforms,
          productLink: {
            url: campaign.productUrl,
            position: postText.indexOf(campaign.productUrl),
            isIncluded: postText.includes(campaign.productUrl)
          },
          metadata: {
            generatedBy: 'product-campaign',
            campaignId: campaign._id.toString(),
            productTitle: campaign.productData.title,
            contentLength: postText.length,
            hashtags: hashtags.map(h => h.substring(1)),
            mentions: []
          },
          stats: {
            likes: 0,
            shares: 0,
            comments: 0,
            impressions: 0
          }
        });
        
        console.log(`📊 [CAMPAIGN] Post logged to database`);
      } catch (dbError) {
        console.error('❌ [CAMPAIGN] Failed to log post to database:', dbError.message);
      }
      
      const successCount = Object.values(results).filter(r => r.success).length;
      
      if (successCount > 0) {
        await campaign.updateAfterPost();
        console.log(`✅ [CAMPAIGN] Campaign updated. Next post at: ${campaign.nextPostAt}`);
      } else {
        console.warn('❌ [CAMPAIGN] All platforms failed for campaign:', campaign._id);
      }
      
    } catch (error) {
      console.error('❌ [CAMPAIGN] Error posting campaign:', error.message);
    }
  }
  
  static startScheduler() {
    cron.schedule('0 * * * *', async () => {
      console.log('⏰ [CAMPAIGN] Running scheduled campaign check...');
      await this.checkAndPostCampaigns();
    });
    
    console.log('🤖 [CAMPAIGN] Product campaign scheduler started (checks every hour)');
  }
  
  static async triggerNow() {
    console.log('🔧 [CAMPAIGN] Manual trigger - checking campaigns now...');
    await this.checkAndPostCampaigns();
  }
}

module.exports = ProductCampaignScheduler;
