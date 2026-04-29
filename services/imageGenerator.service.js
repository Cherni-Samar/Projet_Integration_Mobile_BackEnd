// =============================================================
//  AI IMAGE GENERATOR SERVICE
//  Generates marketing images using AI based on product photos
//  Uses FREE APIs (no credit card required!)
//  Priority: Pollinations > Replicate > Hugging Face
// =============================================================

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class ImageGeneratorService {
  constructor() {
    // Multiple free AI image services (ordered by reliability)
    this.services = [
      {
        name: 'Pollinations',
        url: 'https://image.pollinations.ai/prompt/',
        method: 'GET',
        free: true,
        noKeyRequired: true
      },
      {
        name: 'Replicate (Free Tier)',
        url: 'https://api.replicate.com/v1/predictions',
        method: 'POST',
        free: true,
        requiresKey: false // Can work without key for limited use
      },
      {
        name: 'Hugging Face',
        url: 'https://api-inference.huggingface.co/models/',
        method: 'POST',
        free: true,
        requiresKey: true,
        models: [
          'stabilityai/stable-diffusion-2-1',
          'runwayml/stable-diffusion-v1-5',
          'CompVis/stable-diffusion-v1-4'
        ]
      }
    ];
    
    this.huggingFaceKey = process.env.HUGGINGFACE_API_KEY || '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';
  }

  /**
   * Generate a marketing image based on product photo and description
   * @param {string} productImageUrl - URL of the product image
   * @param {Object} productData - Product information
   * @returns {Promise<string>} - URL of generated image
   */
  async generateMarketingImage(productImageUrl, productData) {
    try {
      console.log('🎨 [IMAGE GEN] Generating FREE marketing image...');
      console.log(`Product: ${productData.title}`);

      // Create a marketing-focused prompt
      const prompt = this.createMarketingPrompt(productData);

      // Try Pollinations first (completely free, no API key needed, most reliable)
      try {
        const imageUrl = await this.generateWithPollinations(prompt);
        console.log('✅ [IMAGE GEN] Image generated successfully with Pollinations (FREE)');
        return imageUrl;
      } catch (pollinationsError) {
        console.log('⚠️ [POLLINATIONS] Failed, trying alternative services...', pollinationsError.message);
        
        // Try Replicate (free tier, no key needed for basic use)
        try {
          const imageUrl = await this.generateWithReplicate(prompt);
          console.log('✅ [IMAGE GEN] Image generated successfully with Replicate (FREE)');
          return imageUrl;
        } catch (replicateError) {
          console.log('⚠️ [REPLICATE] Failed, trying Hugging Face...', replicateError.message);
          
          // Fallback to Hugging Face
          try {
            const imageUrl = await this.generateWithHuggingFace(prompt);
            console.log('✅ [IMAGE GEN] Image generated successfully with Hugging Face (FREE)');
            return imageUrl;
          } catch (hfError) {
            console.log('⚠️ [HUGGING FACE] Failed:', hfError.message);
            throw hfError;
          }
        }
      }

    } catch (error) {
      console.error('❌ [IMAGE GEN] All services failed:', error.message);
      // Return original product image as fallback
      return productImageUrl;
    }
  }

  /**
   * Create a marketing-focused prompt with enhanced quality keywords
   */
  createMarketingPrompt(productData) {
    const { title, category, brand } = productData;

    // Enhanced prompt with professional photography keywords for better quality
    const qualityKeywords = [
      'professional product photography',
      'studio lighting setup',
      'clean white background',
      'commercial advertising photo',
      '8k ultra high resolution',
      'sharp focus',
      'vibrant accurate colors',
      'professional color grading',
      'soft shadows',
      'perfect exposure',
      'product showcase',
      'marketing campaign quality',
      'professional e-commerce photo',
      'detailed texture',
      'premium quality',
      'photorealistic',
      'professional composition',
      'centered product',
      'minimalist aesthetic'
    ];

    // Create an engaging marketing prompt with quality emphasis
    const prompt = `${qualityKeywords.join(', ')}, featuring ${title}, ${brand || ''} ${category || 'product'}, masterpiece, best quality, highly detailed, professional photography`;

    console.log('📝 [PROMPT] Enhanced quality prompt created');
    return prompt;
  }

  /**
   * Generate image using Pollinations (100% FREE, no API key needed!)
   * Most reliable free service with enhanced quality parameters
   */
  async generateWithPollinations(prompt) {
    try {
      console.log('🌸 [POLLINATIONS] Generating HIGH QUALITY image (100% FREE)...');
      console.log('🌐 [POLLINATIONS] No API key required!');
      
      // Pollinations uses GET request with prompt in URL
      const encodedPrompt = encodeURIComponent(prompt);
      const seed = Date.now();
      
      // Enhanced parameters for better quality
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1920&height=1920&seed=${seed}&nologo=true&enhance=true&model=flux&quality=high`;
      
      console.log('🔗 [POLLINATIONS] Image URL:', imageUrl);
      console.log('✨ [POLLINATIONS] Using enhanced quality settings: 1920x1920, flux model, high quality');
      
      // Download the generated image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 90000, // 90 seconds for higher quality
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      console.log('✅ [POLLINATIONS] Response received, status:', response.status);
      console.log('✅ [POLLINATIONS] Image size:', response.data.byteLength, 'bytes');

      // Save the generated image
      const imageBuffer = Buffer.from(response.data);
      const filename = `ai_generated_pollinations_hq_${Date.now()}.png`;
      const filepath = path.join(__dirname, '../public/social-images', filename);
      
      await fs.writeFile(filepath, imageBuffer);
      
      const localImageUrl = `/social-images/${filename}`;
      console.log('✅ [POLLINATIONS] HIGH QUALITY image saved:', localImageUrl);
      
      return localImageUrl;
      
    } catch (error) {
      console.error('❌ [POLLINATIONS] Error:', error.message);
      throw error;
    }
  }

  /**
   * Generate image using Replicate (FREE tier available)
   * Alternative free service
   */
  async generateWithReplicate(prompt) {
    try {
      console.log('🔄 [REPLICATE] Generating image (FREE tier)...');
      
      // Use Replicate's public API endpoint (no auth for basic use)
      // Using stability-ai/sdxl model which is free
      const imageUrl = `https://replicate.delivery/pbxt/create-prediction?version=stability-ai/sdxl&input=${encodeURIComponent(JSON.stringify({
        prompt: prompt,
        width: 1024,
        height: 1024,
        num_outputs: 1
      }))}`;
      
      console.log('🔗 [REPLICATE] Requesting image...');
      
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      console.log('✅ [REPLICATE] Response received, status:', response.status);

      // Save the generated image
      const imageBuffer = Buffer.from(response.data);
      const filename = `ai_generated_replicate_${Date.now()}.png`;
      const filepath = path.join(__dirname, '../public/social-images', filename);
      
      await fs.writeFile(filepath, imageBuffer);
      
      const localImageUrl = `/social-images/${filename}`;
      console.log('✅ [REPLICATE] Image saved:', localImageUrl);
      
      return localImageUrl;
      
    } catch (error) {
      console.error('❌ [REPLICATE] Error:', error.message);
      throw error;
    }
  }

  /**
   * Generate image using Hugging Face (FREE with API key)
   * Fallback option with enhanced quality parameters
   */
  async generateWithHuggingFace(prompt) {
    let lastError = null;
    
    // Try each model until one works
    for (let i = 0; i < this.services[2].models.length; i++) {
      const model = this.services[2].models[i];
      const apiUrl = `${this.services[2].url}${model}`;
      
      try {
        console.log(`🤖 [HUGGING FACE] Trying model ${i + 1}/${this.services[2].models.length}: ${model}`);
        console.log('🔑 [HUGGING FACE] Using token:', this.huggingFaceKey.substring(0, 8) + '...');
        console.log('✨ [HUGGING FACE] Using enhanced quality parameters');
        
        const response = await axios.post(
          apiUrl,
          {
            inputs: prompt,
            parameters: {
              num_inference_steps: 50, // Increased from 20 for better quality
              guidance_scale: 8.5, // Increased from 7.5 for better prompt adherence
              width: 768, // Increased from 512
              height: 768, // Increased from 512
              negative_prompt: 'blurry, low quality, distorted, ugly, bad anatomy, watermark, text, logo, signature, low resolution, pixelated, grainy, amateur, poor lighting'
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.huggingFaceKey}`,
              'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer',
            timeout: 90000 // Increased timeout for better quality
          }
        );

        console.log('✅ [HUGGING FACE] Response received, status:', response.status);

        // Save the generated image
        const imageBuffer = Buffer.from(response.data);
        const filename = `ai_generated_hf_hq_${Date.now()}.png`;
        const filepath = path.join(__dirname, '../public/social-images', filename);
        
        await fs.writeFile(filepath, imageBuffer);
        
        const imageUrl = `/social-images/${filename}`;
        console.log('✅ [HUGGING FACE] HIGH QUALITY image saved:', imageUrl);
        
        return imageUrl;
        
      } catch (error) {
        console.log(`❌ [HUGGING FACE] Model ${model} failed:`, error.response?.status, error.message);
        lastError = error;
        
        // Check if it's a model loading error
        if (error.response && error.response.status === 503) {
          console.log('⏳ [HUGGING FACE] Model is loading, waiting 5 seconds...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Retry this model once with enhanced parameters
          try {
            const retryResponse = await axios.post(
              apiUrl,
              {
                inputs: prompt,
                parameters: {
                  num_inference_steps: 30, // Balanced quality for retry
                  guidance_scale: 8.0,
                  width: 768,
                  height: 768,
                  negative_prompt: 'blurry, low quality, distorted, ugly, bad anatomy, watermark, text, logo'
                }
              },
              {
                headers: {
                  'Authorization': `Bearer ${this.huggingFaceKey}`,
                  'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer',
                timeout: 90000
              }
            );

            const imageBuffer = Buffer.from(retryResponse.data);
            const filename = `ai_generated_hf_retry_hq_${Date.now()}.png`;
            const filepath = path.join(__dirname, '../public/social-images', filename);
            
            await fs.writeFile(filepath, imageBuffer);
            
            console.log('✅ [HUGGING FACE] HIGH QUALITY image saved (retry)');
            return `/social-images/${filename}`;
          } catch (retryError) {
            console.error('❌ [HUGGING FACE] Retry failed for', model, ':', retryError.message);
            lastError = retryError;
          }
        }
        
        // Continue to next model
        continue;
      }
    }
    
    // All models failed
    console.error('❌ [HUGGING FACE] All models failed. Last error:', lastError?.message);
    throw lastError || new Error('All Hugging Face models failed');
  }
}

module.exports = new ImageGeneratorService();
