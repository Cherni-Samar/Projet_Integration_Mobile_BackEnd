// services/productMarketingGenerator.service.js
const { ChatGroq } = require('@langchain/groq');
const imageGeneratorService = require('./imageGenerator.service');

class ProductMarketingGenerator {
  /**
   * Generate marketing post for a product with AI-generated image
   * @param {Object} product - Product information from scraper
   * @param {boolean} generateImage - Whether to generate AI image
   * @returns {Promise<Object>} Generated marketing post and image
   */
  static async generateMarketingPost(product, generateImage = true) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.8,
    });

    const prompt = this._buildMarketingPrompt(product);

    try {
      console.log(`🤖 [MARKETING AI] Generating post for: ${product.title}`);
      
      const response = await llm.invoke(prompt);
      const text = typeof response.content === 'string' 
        ? response.content.trim() 
        : String(response.content).trim();

      // Remove quotes if present
      const cleanText = text.replace(/^["']|["']$/g, '');

      console.log(`✅ [MARKETING AI] Post generated successfully`);

      // Generate AI image if requested and product has images
      let generatedImageUrl = null;
      if (generateImage && product.images && product.images.length > 0) {
        try {
          generatedImageUrl = await imageGeneratorService.generateMarketingImage(
            product.images[0],
            product
          );
          console.log(`✅ [MARKETING AI] Image generated: ${generatedImageUrl}`);
        } catch (imageError) {
          console.error('⚠️ [MARKETING AI] Image generation failed, using original:', imageError.message);
          generatedImageUrl = product.images[0];
        }
      }

      return {
        text: cleanText,
        image: generatedImageUrl || (product.images && product.images[0]) || null
      };

    } catch (error) {
      console.error('❌ [MARKETING AI] Error generating post:', error.message);
      throw error;
    }
  }

  /**
   * Build marketing prompt for AI
   */
  static _buildMarketingPrompt(product) {
    const productInfo = `
PRODUCT INFORMATION:
- Title: ${product.title}
- Description: ${product.description || 'N/A'}
- Price: ${product.price || 'N/A'}
- Category: ${product.category || 'N/A'}
- Brand: ${product.brand || 'N/A'}
- Features: ${product.features && product.features.length > 0 ? product.features.join(', ') : 'N/A'}
- Product URL: ${product.url}
`;

    return `Tu es un expert en marketing digital et copywriting pour LinkedIn. 

${productInfo}

MISSION:
Crée un post LinkedIn captivant et professionnel pour promouvoir ce produit.

RÈGLES STRICTES:
1. NE COMMENCE PAS par "Je suis Echo" ou "Bonjour" ou toute introduction
2. Entre DIRECTEMENT dans le vif du sujet avec une accroche percutante
3. Utilise un ton de leader d'opinion (expert, visionnaire, inspirant)
4. Structure: 
   - Accroche forte (1 ligne)
   - Problème résolu par le produit (2-3 lignes)
   - Bénéfices clés (3-4 points avec emojis)
   - Call-to-action avec le lien du produit
5. Intègre NATURELLEMENT le lien du produit dans le texte (pas à la fin comme signature)
6. Utilise des phrases comme "Découvrez comment..." ou "Explorez cette solution..."
7. Maximum 450 caractères (IMPORTANT: Mastodon limite à 500 caractères)
8. Finis avec 2-3 hashtags stratégiques pertinents au produit
9. Maximum 1-2 emojis discrets
10. Pas de guillemets autour du texte
11. Le lien doit apparaître au milieu du contenu, pas en conclusion
12. Crée un sentiment d'urgence ou d'exclusivité

STYLE:
- Professionnel mais accessible
- Orienté bénéfices client
- Storytelling si possible
- Crédible et authentique

Génère maintenant le post LinkedIn parfait pour ce produit.`;
  }

  /**
   * Generate multiple post variations
   * @param {Object} product - Product information
   * @param {number} count - Number of variations to generate
   * @returns {Promise<Array<string>>} Array of generated posts
   */
  static async generateMultipleVariations(product, count = 3) {
    const posts = [];
    
    for (let i = 0; i < count; i++) {
      try {
        const post = await this.generateMarketingPost(product);
        posts.push(post);
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ [MARKETING AI] Error generating variation ${i + 1}:`, error.message);
      }
    }

    return posts;
  }

  /**
   * Generate post with specific style
   * @param {Object} product - Product information
   * @param {string} style - Post style (professional, casual, technical, emotional)
   * @returns {Promise<string>} Generated post
   */
  static async generateStyledPost(product, style = 'professional') {
    const stylePrompts = {
      professional: 'Ton très professionnel et corporate',
      casual: 'Ton décontracté et friendly',
      technical: 'Ton technique avec détails produit',
      emotional: 'Ton émotionnel qui touche le cœur'
    };

    const basePrompt = this._buildMarketingPrompt(product);
    const styledPrompt = basePrompt + `\n\nSTYLE REQUIS: ${stylePrompts[style] || stylePrompts.professional}`;

    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.8,
    });

    try {
      const response = await llm.invoke(styledPrompt);
      const text = typeof response.content === 'string' 
        ? response.content.trim() 
        : String(response.content).trim();

      return text.replace(/^["']|["']$/g, '');
    } catch (error) {
      console.error('❌ [MARKETING AI] Error generating styled post:', error.message);
      throw error;
    }
  }
}

module.exports = ProductMarketingGenerator;
