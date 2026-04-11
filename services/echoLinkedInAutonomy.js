// Posts périodiques multi-plateformes (LinkedIn, Facebook, etc.) — contenu généré par Groq
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
  } catch {
    /* ignore */
  }
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
    parseInt(process.env.ECHO_SOCIAL_MEDIA_AUTONOMY_INTERVAL_HOURS || '72', 10) // 3 jours par défaut
  );
  return hours * 60 * 60 * 1000;
}

async function generateAutonomousPost() {
  if (!process.env.GROQ_API_KEY) return null;
  const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    temperature: 0.85,
  });

  // Catégories variées pour ne JAMAIS avoir le même post
  const categories = [
    { type: 'Tips', instruction: 'Partage un conseil pratique et actionnable pour les développeurs (code, architecture, ou productivité)' },
    { type: 'Success', instruction: 'Partage une success story inspirante sur une transformation digitale ou une réussite tech' },
    { type: 'Tendance', instruction: 'Présente une tendance technologique émergente (IA, cloud, cybersécurité, DevOps) et son impact concret' },
    { type: 'Culture', instruction: 'Parle de la culture d\'entreprise tech idéale : remote, bien-être, management agile, etc.' },
    { type: 'Outil', instruction: 'Recommande un outil ou framework que tout développeur devrait connaître, avec un cas d\'usage concret' },
    { type: 'Débat', instruction: 'Lance un débat professionnel sur un sujet tech polarisant (monolithe vs microservices, AI vs code manuel, etc.)' },
    { type: 'Chiffres', instruction: 'Partage des statistiques ou chiffres marquants sur le marché tech, l\'emploi ou l\'innovation' },
    { type: 'Motivation', instruction: 'Écris un post motivant pour les développeurs juniors ou ceux en reconversion tech' },
  ];

  const picked = categories[Math.floor(Math.random() * categories.length)];
  console.log(`📝 [ECHO] Catégorie de post sélectionnée : ${picked.type}`);

  const prompt = `Tu es Echo, l'agent IA de communication de E-Team.
${picked.instruction}.

RÈGLES :
- Écris UNIQUEMENT le texte du post LinkedIn, en français.
- Audience : développeurs, ingénieurs, passionnés de tech.
- Ton : professionnel, moderne, engageant.
- 5 à 8 lignes courtes, avec une accroche forte.
- Donne un insight CONCRET (pas de généralités vagues).
- 2 à 4 hashtags pertinents à la fin.
- Maximum 1 emoji dans tout le post.
- Max ~900 caractères.
- NE PAS entourer le texte de guillemets.`;

  const out = await llm.invoke(prompt);
  const text = typeof out.content === 'string' ? out.content.trim() : String(out.content).trim();
  return text.replace(/^["']|["']$/g, '');
}

async function tick() {
  if (process.env.ECHO_SOCIAL_MEDIA_AUTONOMY_ENABLED !== 'true') return;

  const state = loadState();
  const last = state.lastAutonomousPostAt ? new Date(state.lastAutonomousPostAt).getTime() : 0;
  if (last && Date.now() - last < intervalMs()) return;

  let postText = await generateAutonomousPost();
  if (!postText) {
    console.warn('Echo Social Media autonomie: pas de texte (Groq?)');
    return;
  }
  if (postText.length > 2900) postText = postText.slice(0, 2900);

  // Publier sur toutes les plateformes activées
  const results = {};

  // ── Générer une image IA (Pollinations.ai — gratuit) ──
  let imageBuffer = null;
  let imageFileName = null;
  try {
    const imageGenerator = require('./imageGenerator.service');
    // Extraire les mots-clés du post pour l'image
    const keywords = postText.substring(0, 100).replace(/#/g, '').replace(/\n/g, ' ');
    const imageResult = await imageGenerator.generate(keywords);
    imageBuffer = imageResult.buffer;
    imageFileName = imageResult.fileName;
  } catch (imgErr) {
    console.warn('⚠️ Image generation failed (post sans image):', imgErr.message);
  }

  // Publication LinkedIn (avec image si disponible)
  try {
    const linkedinResult = await linkedinService.post(postText, imageBuffer);
    results.linkedin = linkedinResult;
  } catch (error) {
    results.linkedin = { success: false, error: error.message };
  }

  // Publication Mastodon (avec image si disponible)
  try {
    const mastodonService = require('./mastodon.service');
    const mastodonResult = await mastodonService.post(postText, imageBuffer, imageFileName);
    results.mastodon = mastodonResult;
  } catch (error) {
    results.mastodon = { success: false, error: error.message };
  }

  // Vérifier si au moins une publication a réussi
  const successCount = Object.values(results).filter(r => r.success).length;

  if (successCount > 0) {
    const successfulPlatforms = Object.entries(results)
      .filter(([_, r]) => r.success)
      .map(([platform, _]) => platform);

    saveState({
      lastAutonomousPostAt: new Date().toISOString(),
      lastPlatforms: successfulPlatforms,
      lastResults: results
    });

    console.log(`Echo Social Media autonomie: ${successCount} publication(s) réussie(s) sur ${successfulPlatforms.join(', ')}`);
  } else {
    console.warn('Echo Social Media autonomie: toutes les publications ont échoué', results);
  }
}

function startEchoSocialMediaAutonomy() {
  cron.schedule('0 */6 * * *', () => {
    tick().catch((e) => console.error('Echo Social Media autonomie:', e.message));
  });
  console.log(
    'Echo Social Media autonomie: cron actif (vérif. toutes les 6h, intervalle min.',
    Math.round(intervalMs() / 3600000),
    'h) — ECHO_SOCIAL_MEDIA_AUTONOMY_ENABLED=true pour activer'
  );
}

module.exports = { startEchoSocialMediaAutonomy, tick };
