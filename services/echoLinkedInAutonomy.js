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
    temperature: 0.6,
  });
  const prompt = `You are Echo (dev, automation, AI, communication). Write ONLY the LinkedIn post text in French.
- Audience: developers, engineers, tech enthusiasts.
- Topics: development, AI, automation, or project updates (Echo-style). No recruitment focus here.
- Tone: professional, modern, slightly engaging.
- 5–8 short lines, strong hook, concrete insight (do not invent company-specific facts).
- 2–4 hashtags (#AI #Development #Tech #Automation).
- Max 1 emoji in the whole post.
- No quotes wrapping the full message. Max ~900 characters.`;
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
  
  // Publication LinkedIn
  try {
    const linkedinResult = await linkedinService.post(postText);
    results.linkedin = linkedinResult;
  } catch (error) {
    results.linkedin = { success: false, error: error.message };
  }
  
  // Publication Facebook
  try {
    const facebookResult = await facebookService.post(postText);
    results.facebook = facebookResult;
  } catch (error) {
    results.facebook = { success: false, error: error.message };
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
