// services/productCampaignScheduler.service.js
const cron = require('node-cron');
const ProductCampaign = require('../models/ProductCampaign');
const ProductMarketingGenerator = require('./productMarketingGenerator.service');
const linkedinService = require('./linkedin.service');
const SocialPost = require('../models/SocialPost');
const ActivityLogger = require('./activityLogger.service');
const { manualEnergyConsumption } = require('../middleware/energyMiddleware');
const User = require('../models/User');
const fs = require('fs').promises;
const path = require('path');

class ProductCampaignScheduler {
  /**
   * Check and post ready campaigns
   */
  static async checkAndPostCampaigns() {
    try {
      console.log('🔍 [CAMPAIGN] Checking for campaigns ready to post...');
      
      // ✅ ECHO AGENT OWNERSHIP CHECK - Critical Security
      const { findUserWithAgentAndEnergy } = require('../utils/agentGuard');
      const userCheck = await findUserWithAgentAndEnergy('echo');
      
      if (!userCheck.hasAgent || !userCheck.userId) {
        console.log('⛔ ECHO blocked: No users have purchased ECHO agent or have energy - skipping campaign');
        return;
      }
      
      console.log(`✅ [CAMPAIGN] Echo agent ownership verified for user: ${userCheck.userId}`);
      
      // Find active campaigns that are ready to post
      const readyToPost = await ProductCampaign.getReadyToPost();
      
      if (readyToPost.length === 0) {
        console.log('⏳ [CAMPAIGN] No campaigns ready to post yet');
        return;
      }
      
      console.log(`📢 [CAMPAIGN] Found ${readyToPost.length} campaign(s) ready to post`);
      
      // Process each campaign with the verified user
      for (const campaign of readyToPost) {
        await this.postCampaign(campaign, userCheck.userId);
      }
      
    } catch (error) {
      console.error('❌ [CAMPAIGN] Error checking campaigns:', error.message);
    }
  }
  
  /**
   * Post a single campaign to configured platforms
   */
  static async postCampaign(campaign, verifiedUserId = null) {
    try {
      console.log(`🚀 [CAMPAIGN] Posting campaign: ${campaign.productData.title}`);
      console.log(`📋 [CAMPAIGN] Platforms configured: ${campaign.platforms.join(', ')}`);
      console.log(`🔗 [CAMPAIGN] Product URL: ${campaign.productUrl}`);
      
      // Use verified user ID or find user with Echo agent and energy
      let userId = verifiedUserId;
      if (!userId) {
        const { findUserWithAgentAndEnergy } = require('../utils/agentGuard');
        const userCheck = await findUserWithAgentAndEnergy('echo');
        
        if (!userCheck.hasAgent || !userCheck.userId) {
          console.log('⛔ ECHO blocked: User hasn\'t purchased ECHO - skipping campaign');
          return;
        }
        
        userId = userCheck.userId;
      }
      
      console.log(`⚡ [CAMPAIGN] Using user portfolio for energy: ${userId}`);
      
      // Check LinkedIn authentication status
      const linkedinService = require('./linkedin.service');
      const sessionInfo = linkedinService.getSessionInfo();
      console.log(`🔐 [CAMPAIGN] LinkedIn auth status: ${sessionInfo.hasAccessToken ? '✅ Authenticated' : '❌ Not authenticated'}`);
      if (!sessionInfo.hasAccessToken && campaign.platforms.includes('linkedin')) {
        console.warn('⚠️  [CAMPAIGN] LinkedIn is in platforms but not authenticated! Will only post to other platforms.');
      }
      
      let totalEnergyCost = 0;
      
      // Generate marketing post
      const postResult = await ProductMarketingGenerator.generateMarketingPost(
        campaign.productData,
        campaign.settings.includeImage
      );
      
      // ⚡ CONSUME ENERGY FOR CONTENT_GENERATION
      const contentEnergyResult = await manualEnergyConsumption(
        'echo',
        'CONTENT_GENERATION',
        `Product marketing post for ${campaign.productData.title}`,
        { productTitle: campaign.productData.title, campaignId: campaign._id },
        userId
      );
      
      if (contentEnergyResult.success) {
        totalEnergyCost += contentEnergyResult.energyCost;
        console.log(`⚡ [ENERGY] Echo consumed ${contentEnergyResult.energyCost} energy for CONTENT_GENERATION`);
      } else if (contentEnergyResult.blocked) {
        console.log('⛔ ECHO blocked: Campaign content generation blocked - user hasn\'t purchased ECHO');
        return;
      }
      
      // ⚡ CONSUME ENERGY FOR IMAGE_GENERATION (if image was generated)
      if (postResult.image) {
        const imageEnergyResult = await manualEnergyConsumption(
          'echo',
          'IMAGE_GENERATION',
          `AI image for ${campaign.productData.title}`,
          { productTitle: campaign.productData.title, imageUrl: postResult.image },
          userId
        );
        
        if (imageEnergyResult.success) {
          totalEnergyCost += imageEnergyResult.energyCost;
          console.log(`⚡ [ENERGY] Echo consumed ${imageEnergyResult.energyCost} energy for IMAGE_GENERATION`);
        } else if (imageEnergyResult.blocked) {
          console.log('⛔ ECHO blocked: Campaign image generation blocked - user hasn\'t purchased ECHO');
          return;
        }
      }
      
      const postText = postResult.text || postResult;
      const imageUrl = postResult.image;
      
      // Download image if URL provided
      let imageBuffer = null;
      if (imageUrl) {
        try {
          // Check if it's a local filesystem path
          if (imageUrl.startsWith('/social-images/')) {
            // Read from filesystem
            console.log(`📂 [CAMPAIGN] Reading image from filesystem: ${imageUrl}`);
            const absolutePath = path.join(__dirname, '../public', imageUrl);
            imageBuffer = await fs.readFile(absolutePath);
            console.log(`✅ [CAMPAIGN] Image read from filesystem (${imageBuffer.length} bytes)`);
          } else {
            // Download from HTTP/HTTPS URL
            console.log(`📥 [CAMPAIGN] Downloading image from: ${imageUrl}`);
            const axios = require('axios');
            const response = await axios.get(imageUrl, { 
              responseType: 'arraybuffer',
              timeout: 10000, // 10 second timeout
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            imageBuffer = Buffer.from(response.data);
            console.log(`✅ [CAMPAIGN] Image downloaded successfully (${imageBuffer.length} bytes)`);
          }
          
          // Validate image size (LinkedIn has limits)
          const maxSize = 5 * 1024 * 1024; // 5MB
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
      
      // Post to each configured platform
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
      
      // ⚡ CONSUME ENERGY FOR SOCIAL_POST (publishing)
      const publishEnergyResult = await manualEnergyConsumption(
        'echo',
        'SOCIAL_POST',
        `Publishing product campaign to ${campaign.platforms.join(', ')}`,
        { 
          platforms: Object.keys(results),
          successCount: Object.values(results).filter(r => r.success).length,
          campaignId: campaign._id
        },
        userId
      );
      
      if (publishEnergyResult.success) {
        totalEnergyCost += publishEnergyResult.energyCost;
        console.log(`⚡ [ENERGY] Echo consumed ${publishEnergyResult.energyCost} energy for SOCIAL_POST`);
      } else if (publishEnergyResult.blocked) {
        console.log('⛔ ECHO blocked: Campaign publishing blocked - user hasn\'t purchased ECHO');
        return;
      }
      
      // Log post to database
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
        
        // Extract hashtags
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
            mentions: [],
            energyConsumed: totalEnergyCost
          },
          stats: {
            likes: 0,
            shares: 0,
            comments: 0,
            impressions: 0
          }
        });
        
        console.log(`📊 [CAMPAIGN] Post logged to database (Total energy: ${totalEnergyCost})`);
      } catch (dbError) {
        console.error('❌ [CAMPAIGN] Failed to log post to database:', dbError.message);
      }
      
      // Update campaign after posting
      const successCount = Object.values(results).filter(r => r.success).length;
      
      if (successCount > 0) {
        await campaign.updateAfterPost();
        console.log(`✅ [CAMPAIGN] Campaign updated. Next post at: ${campaign.nextPostAt}`);
        
        // Log activity
        await ActivityLogger.logEchoActivity(
          'SOCIAL_POST',
          `Product campaign post published: ${campaign.productData.title}`,
          {
            targetAgent: 'external',
            description: `Published product marketing post to ${successCount} platform(s)`,
            status: 'success',
            energyConsumed: totalEnergyCost,
            priority: 'medium',
            metadata: {
              campaignId: campaign._id.toString(),
              productTitle: campaign.productData.title,
              productUrl: campaign.productUrl,
              platforms: Object.keys(results).filter(p => results[p].success),
              contentLength: postText.length,
              hasImage: !!imageUrl
            }
          }
        );
      } else {
        console.warn('❌ [CAMPAIGN] All platforms failed for campaign:', campaign._id);
        
        // Log failed activity
        await ActivityLogger.logEchoActivity(
          'SOCIAL_POST',
          `Failed to publish product campaign: ${campaign.productData.title}`,
          {
            status: 'failed',
            priority: 'high',
            metadata: {
              campaignId: campaign._id.toString(),
              productTitle: campaign.productData.title,
              errors: Object.keys(results).map(p => ({ platform: p, error: results[p].error }))
            }
          }
        );
      }
      
    } catch (error) {
      console.error('❌ [CAMPAIGN] Error posting campaign:', error.message);
    }
  }
  
  /**
   * Start the campaign scheduler cron job
   */
  static startScheduler() {
    // Check every hour for campaigns ready to post
    cron.schedule('0 * * * *', async () => {
      console.log('⏰ [CAMPAIGN] Running scheduled campaign check...');
      await this.checkAndPostCampaigns();
    });
    
    console.log('🤖 [CAMPAIGN] Product campaign scheduler started (checks every hour)');
  }
  
  /**
   * Manually trigger campaign check (for testing)
   */
  static async triggerNow() {
    console.log('🔧 [CAMPAIGN] Manual trigger - checking campaigns now...');
    await this.checkAndPostCampaigns();
  }
}

module.exports = ProductCampaignScheduler;
