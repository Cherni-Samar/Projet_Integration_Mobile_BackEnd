// services/echoLinkedInAutonomy.js
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { ChatGroq } = require('@langchain/groq');
const linkedinService = require('./linkedin.service');
const SocialPost = require('../models/SocialPost');
const ActivityLogger = require('./activityLogger.service');

const stateFile = path.join(__dirname, '../.echo_social_media_autonomy.json');

function loadState() {
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    }
  } catch { /* ignore */ }
  return { lastAutonomousPostAt: null };
}

function saveState(state) {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('echoSocialMediaAutonomy saveState:', e.message);
  }
}

function intervalMs() {
  const hours = Math.max(
    24,
    parseInt(process.env.ECHO_SOCIAL_MEDIA_AUTONOMY_INTERVAL_HOURS || '72', 10)
  );
  return hours * 60 * 60 * 1000;
}

/**
 * Validates and prepares product link from environment variable
 * @param {string} link - The product link URL to validate
 * @returns {string|null} - Validated URL string or null if invalid
 */
function validateProductLink(link) {
  if (!link || typeof link !== 'string' || link.trim() === '') {
    return null;
  }
  
  try {
    const url = new URL(link.trim());
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      console.log(`🔗 [ECHO] Product link configured: ${url.toString()}`);
      return url.toString();
    }
  } catch (error) {
    console.warn(`⚠️ [ECHO] Invalid ECHO_PRODUCT_LINK format: ${link}`);
  }
  
  return null;
}

/**
 * Builds enhanced prompt with optional product link integration
 * @param {Object} category - The content category with type and instruction
 * @param {string|null} productLink - Validated product link URL or null
 * @returns {string} - Complete prompt for LLM
 */
function buildEnhancedPrompt(category, productLink) {
  const basePrompt = `Tu es Echo, l'agent de communication stratégique de E-Team. 
  Sujet : ${category.instruction}.

  RÈGLES DE RÉDACTION :
  - NE COMMENCE PAS par "Je suis Echo" ou "Bonjour".
  - Entre directement dans le vif du sujet avec une phrase d'accroche percutante.
  - Utilise un ton de leader d'opinion (expert, visionnaire, inspirant).
  - Structure : Accroche forte / Développement court (3-4 lignes) / Conclusion ouverte.
  - Langue : Français impeccable.
  - Finis avec 3 hashtags stratégiques dont #ETeam.
  - Maximum 1 emoji discret.
  - Pas de guillemets autour du texte.`;

  if (productLink) {
    return basePrompt + `

  INTÉGRATION PRODUIT OBLIGATOIRE :
  - Intègre naturellement ce lien dans le contenu : ${productLink}
  - Le lien doit être tissé dans le récit, PAS ajouté à la fin comme une signature
  - Crée un contexte qui justifie pourquoi le lecteur devrait visiter ce lien
  - Utilise des phrases comme "Découvrez comment nous..." ou "Explorez nos solutions..."
  - Le lien doit apparaître au milieu du développement, pas en conclusion
  - Assure-toi que l'intégration semble authentique et apporte de la valeur`;
  }

  return basePrompt;
}

async function generateAutonomousPost() {
  if (!process.env.GROQ_API_KEY) return null;
  const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    temperature: 0.8,
  });

  const categories = [
    { type: 'Vision', instruction: 'Analyse comment les agents autonomes comme Hera et Dexo transforment la productivité en entreprise.' },
    { type: 'Tech', instruction: 'Explique un concept technique (Node.js, LLM, ou architecture micro-services) de façon simple et brillante.' },
    { type: 'Futur', instruction: 'Partage une réflexion sur la collaboration humain-IA : pourquoi l\'IA ne remplace pas l\'humain mais l\'augmente.' },
    { type: 'Culture', instruction: 'Décris l\'importance de l\'agilité et de l\'automatisation dans une startup tech moderne.' }
  ];

  const picked = categories[Math.floor(Math.random() * categories.length)];
  console.log(`📝 [ECHO] Sujet du jour : ${picked.type}`);

  // Validate and prepare product link
  const productLink = process.env.ECHO_PRODUCT_LINK;
  const validatedLink = validateProductLink(productLink);
  
  // Build enhanced prompt with optional product link
  const prompt = buildEnhancedPrompt(picked, validatedLink);

  try {
    const out = await llm.invoke(prompt);
    const text = typeof out.content === 'string' ? out.content.trim() : String(out.content).trim();
    return text.replace(/^["']|["']$/g, '');
  } catch (e) {
    console.error("❌ Erreur Groq:", e.message);
    return null;
  }
}

async function tick(force = false) {
  if (process.env.ECHO_SOCIAL_MEDIA_AUTONOMY_ENABLED !== 'true') return;

  const state = loadState();
  const last = state.lastAutonomousPostAt ? new Date(state.lastAutonomousPostAt).getTime() : 0;
  
  // VÉRIFICATION DU DÉLAI (Ignorée si force est true)
  if (!force && last && (Date.now() - last < intervalMs())) {
      console.log("⏳ [ECHO] Trop tôt pour publier (Délai de 3 jours).");
      return;
  }

  console.log(`🚀 [ECHO] Lancement de la publication ${force ? '(FORCÉE)' : '(PROGRAMMÉE)'}...`);

  // 1. Générer le texte
  let postText = await generateAutonomousPost();
  if (!postText) return;
  if (postText.length > 2900) postText = postText.slice(0, 2900);

  // Get product link info for logging
  const productLink = process.env.ECHO_PRODUCT_LINK;
  const validatedLink = validateProductLink(productLink);
  const hasProductLink = !!validatedLink;
  
  // Calculate product link position in content
  let linkPosition = -1;
  if (hasProductLink && validatedLink) {
    linkPosition = postText.indexOf(validatedLink);
  }

  // ⚡ CONSUME ENERGY FOR CONTENT_GENERATION
  const { manualEnergyConsumption } = require('../middleware/energyMiddleware');
  const User = require('../models/User');
  let totalEnergyCost = 0;
  
  // Find user with most energy for autonomous energy deduction
  let userId = null;
  try {
    const userWithEnergy = await User.findOne({ energyBalance: { $gt: 0 } }).sort({ energyBalance: -1 });
    if (userWithEnergy) {
      userId = userWithEnergy._id.toString();
      console.log(`⚡ [AUTONOMOUS] Using user portfolio for energy: ${userId} (${userWithEnergy.energyBalance} energy)`);
    }
  } catch (err) {
    console.warn('⚠️ [AUTONOMOUS] Could not find user for energy deduction:', err.message);
  }
  
  const contentEnergyResult = await manualEnergyConsumption(
    'echo',
    'CONTENT_GENERATION',
    'Autonomous social media post generation',
    { forced: force, contentLength: postText.length, hasProductLink },
    userId // Pass userId for user portfolio deduction
  );
  
  if (contentEnergyResult.success) {
    totalEnergyCost += contentEnergyResult.energyCost;
    console.log(`⚡ [ENERGY] Echo consumed ${contentEnergyResult.energyCost} energy for CONTENT_GENERATION`);
  } else {
    console.warn(`⚠️ [ENERGY] ${contentEnergyResult.error} - Continuing with post generation`);
  }

  // 2. Générer une image IA
  let imageBuffer = null;
  let imageFileName = null;
  try {
    const imageGenerator = require('./imageGenerator.service');
    const keywords = postText.substring(0, 50).replace(/#/g, '');
    const imageResult = await imageGenerator.generate(keywords);
    imageBuffer = imageResult.buffer;
    imageFileName = imageResult.fileName;
    
    // ⚡ CONSUME ENERGY FOR IMAGE_GENERATION
    const imageEnergyResult = await manualEnergyConsumption(
      'echo',
      'IMAGE_GENERATION',
      'AI image generation for social post',
      { keywords, fileName: imageFileName },
      userId // Pass userId for user portfolio deduction
    );
    
    if (imageEnergyResult.success) {
      totalEnergyCost += imageEnergyResult.energyCost;
      console.log(`⚡ [ENERGY] Echo consumed ${imageEnergyResult.energyCost} energy for IMAGE_GENERATION`);
    }
  } catch (imgErr) {
    console.warn('⚠️ Échec image generation, post sans image.');
  }

  const results = {};

  // 3. Publier sur LinkedIn
  try {
    results.linkedin = await linkedinService.post(postText, imageBuffer);
  } catch (error) {
    results.linkedin = { success: false, error: error.message };
  }

  // 4. Publier sur Mastodon
  try {
    const mastodonService = require('./mastodon.service');
    results.mastodon = await mastodonService.post(postText, imageBuffer, imageFileName);
  } catch (error) {
    results.mastodon = { success: false, error: error.message };
  }
  
  // ⚡ CONSUME ENERGY FOR SOCIAL_POST (publishing)
  const publishEnergyResult = await manualEnergyConsumption(
    'echo',
    'SOCIAL_POST',
    'Publishing to social media platforms',
    { 
      platforms: Object.keys(results),
      successCount: Object.values(results).filter(r => r.success).length
    },
    userId // Pass userId for user portfolio deduction
  );
  
  if (publishEnergyResult.success) {
    totalEnergyCost += publishEnergyResult.energyCost;
    console.log(`⚡ [ENERGY] Echo consumed ${publishEnergyResult.energyCost} energy for SOCIAL_POST`);
  }

  // 5. Log post to database for mobile app
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

    // Extract hashtags from content
    const hashtags = postText.match(/#\w+/g) || [];
    
    // Determine image type and source
    let imageData = undefined;
    if (imageFileName) {
      let imageType = 'none';
      let imageSource = null;
      if (imageFileName.includes('ai_generated_pollinations')) {
        imageType = 'ai-generated';
        imageSource = 'pollinations';
      } else if (imageFileName.includes('ai_generated')) {
        imageType = 'ai-generated';
        imageSource = 'huggingface';
      } else {
        imageType = 'original';
        imageSource = 'echo';
      }
      imageData = {
        url: `/social-images/${imageFileName}`,
        type: imageType,
        source: imageSource
      };
    }
    
    await SocialPost.create({
      content: postText,
      image: imageData,
      platforms: platforms,
      productLink: {
        url: validatedLink || null,
        position: linkPosition,
        isIncluded: hasProductLink && linkPosition >= 0
      },
      metadata: {
        generatedBy: 'echo-autonomous',
        isForced: force,
        contentLength: postText.length,
        hashtags: hashtags.map(h => h.substring(1)), // Remove # prefix
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
    
    console.log(`📊 [ECHO] Post logged to database (Total energy consumed: ${totalEnergyCost})`);
  } catch (dbError) {
    console.error('❌ [ECHO] Failed to log post to database:', dbError.message);
  }

  // Finalisation et sauvegarde de l'état
  const successCount = Object.values(results).filter(r => r.success).length;
  if (successCount > 0) {
    saveState({
      lastAutonomousPostAt: new Date().toISOString(),
      lastPlatforms: Object.keys(results).filter(p => results[p].success)
    });
    console.log(`✅ [ECHO] Réussite: ${successCount} plateforme(s) mise(s) à jour. Total energy: ${totalEnergyCost}`);
    
    // 📝 LOG ACTIVITY
    await ActivityLogger.logEchoActivity(
      'SOCIAL_POST',
      'Autonomous social media post published',
      {
        targetAgent: 'external',
        description: `Generated and published autonomous post to ${successCount} platform(s)`,
        status: 'success',
        energyConsumed: totalEnergyCost,
        priority: 'medium',
        metadata: {
          forced: force,
          platforms: Object.keys(results).filter(p => results[p].success),
          contentLength: postText.length,
          hasImage: !!imageFileName,
          hasProductLink: hasProductLink
        }
      }
    );
  } else {
    console.warn('❌ [ECHO] Échec total des publications.', results);
    
    // 📝 LOG FAILED ACTIVITY
    await ActivityLogger.logEchoActivity(
      'SOCIAL_POST',
      'Failed to publish autonomous post',
      {
        status: 'failed',
        priority: 'high',
        metadata: {
          forced: force,
          errors: Object.keys(results).map(p => ({ platform: p, error: results[p].error }))
        }
      }
    );
  }
}

function startEchoSocialMediaAutonomy() {
  // Vérification toutes les 6 heures
  cron.schedule('0 */6 * * *', () => {
    tick().catch((e) => console.error('Echo Autonomy Error:', e.message));
  });
  
  console.log(`🤖 [ECHO] Autonomie sociale activée (Intervalle: ${Math.round(intervalMs() / 3600000)}h)`);
}

module.exports = { startEchoSocialMediaAutonomy, tick };