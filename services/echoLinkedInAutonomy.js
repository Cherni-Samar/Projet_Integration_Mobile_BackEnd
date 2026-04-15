// services/echoLinkedInAutonomy.js
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { ChatGroq } = require('@langchain/groq');
const linkedinService = require('./linkedin.service');

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

  // LE PROMPT AMÉLIORÉ POUR ÉVITER LE CÔTÉ ROBOTIQUE
  const prompt = `Tu es Echo, l'agent de communication stratégique de E-Team. 
  Sujet : ${picked.instruction}.

  RÈGLES DE RÉDACTION :
  - NE COMMENCE PAS par "Je suis Echo" ou "Bonjour".
  - Entre directement dans le vif du sujet avec une phrase d'accroche percutante.
  - Utilise un ton de leader d'opinion (expert, visionnaire, inspirant).
  - Structure : Accroche forte / Développement court (3-4 lignes) / Conclusion ouverte.
  - Langue : Français impeccable.
  - Finis avec 3 hashtags stratégiques dont #ETeam.
  - Maximum 1 emoji discret.
  - Pas de guillemets autour du texte.`;

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

  // 2. Générer une image IA
  let imageBuffer = null;
  let imageFileName = null;
  try {
    const imageGenerator = require('./imageGenerator.service');
    const keywords = postText.substring(0, 50).replace(/#/g, '');
    const imageResult = await imageGenerator.generate(keywords);
    imageBuffer = imageResult.buffer;
    imageFileName = imageResult.fileName;
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

  // Finalisation et sauvegarde de l'état
  const successCount = Object.values(results).filter(r => r.success).length;
  if (successCount > 0) {
    saveState({
      lastAutonomousPostAt: new Date().toISOString(),
      lastPlatforms: Object.keys(results).filter(p => results[p].success)
    });
    console.log(`✅ [ECHO] Réussite: ${successCount} plateforme(s) mise(s) à jour.`);
  } else {
    console.warn('❌ [ECHO] Échec total des publications.', results);
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