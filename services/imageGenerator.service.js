// services/imageGenerator.service.js
// Génère des images IA gratuitement via Pollinations.ai (pas de clé API !)
// Usage : const buffer = await imageGenerator.generate("tech innovation AI")

const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'social-images');

class ImageGeneratorService {
  constructor() {
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(IMAGES_DIR)) {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }
  }

  /**
   * Génère une image IA via Pollinations.ai (gratuit, pas de clé)
   * @param {string} topic - Le sujet du post (ex: "tech innovation")
   * @returns {Promise<{filePath: string, buffer: Buffer}>}
   */
  async generate(topic) {
    // Thèmes visuels variés pour différencier chaque image
    const themes = [
      'futuristic AI neural network with glowing nodes',
      'modern office workspace with holographic screens',
      'abstract data visualization with flowing particles',
      'team collaboration with digital tools and screens',
      'innovation laboratory with robots and code',
      'cloud computing infrastructure with neon lights',
      'cybersecurity shield with digital lock patterns',
      'startup growth chart with ascending arrows',
    ];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    const seed = Date.now() + Math.floor(Math.random() * 100000);

    const prompt = `Professional social media banner, ${randomTheme}, modern minimalist design, dark background, neon lime green accents, topic: ${topic}, no text, clean, 1200x630`;
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1200&height=630&nologo=true&seed=${seed}`;

    console.log(`🎨 [IMAGE] Génération d'image IA (thème: ${randomTheme.substring(0,30)}...)`);

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Pollinations API error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Sauvegarder localement
    const fileName = `echo_${Date.now()}.png`;
    const filePath = path.join(IMAGES_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    console.log(`✅ [IMAGE] Image générée: ${filePath} (${Math.round(buffer.length / 1024)} KB)`);
    return { filePath, buffer, fileName };
  }
}

module.exports = new ImageGeneratorService();