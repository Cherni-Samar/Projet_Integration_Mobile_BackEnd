// services/mastodon.service.js
// Plateforme 100% gratuite — API REST simple (pas de npm nécessaire)

const FormData = require('form-data');

class MastodonService {
  constructor() {
    this.instanceUrl = process.env.MASTODON_INSTANCE_URL || 'https://mastodon.social';
    this.accessToken = process.env.MASTODON_ACCESS_TOKEN || null;
  }

  /**
   * Upload une image sur Mastodon et retourne le media_id
   */
  async uploadImage(buffer, fileName) {
    if (!this.accessToken) return null;

    try {
      const form = new FormData();
      form.append('file', buffer, { filename: fileName || 'image.png', contentType: 'image/png' });
      form.append('description', 'E-Team — Post automatique par Echo Agent IA');

      const response = await fetch(`${this.instanceUrl}/api/v2/media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          ...form.getHeaders(),
        },
        body: form.getBuffer(),
      });

      if (!response.ok) {
        const err = await response.text();
        console.warn('⚠️ Mastodon image upload error:', err);
        return null;
      }

      const data = await response.json();
      console.log(`📷 [MASTODON] Image uploadée: ${data.id}`);
      return data.id;
    } catch (error) {
      console.warn('⚠️ Mastodon image upload failed:', error.message);
      return null;
    }
  }

  /**
   * Publie un post sur Mastodon (avec ou sans image)
   */
  async post(message, imageBuffer, imageFileName) {
    if (!this.accessToken) {
      console.warn('⚠️ Mastodon: pas de token configuré (MASTODON_ACCESS_TOKEN dans .env)');
      return { success: false, error: 'MASTODON_ACCESS_TOKEN non configuré' };
    }

    try {
      const statusText = message.length > 500 ? message.substring(0, 497) + '...' : message;

      // Upload image si fournie
      let mediaIds = [];
      if (imageBuffer) {
        const mediaId = await this.uploadImage(imageBuffer, imageFileName);
        if (mediaId) mediaIds.push(mediaId);
      }

      const body = {
        status: statusText,
        visibility: 'public',
      };
      if (mediaIds.length > 0) {
        body.media_ids = mediaIds;
      }

      const response = await fetch(`${this.instanceUrl}/api/v1/statuses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Mastodon API error:', response.status, errorText);
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      console.log(`✅ Publié sur Mastodon ! ID: ${data.id}`);
      console.log(`📎 URL: ${data.url}`);
      return { success: true, postId: data.id, url: data.url };
    } catch (error) {
      console.error('❌ Erreur Mastodon:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new MastodonService();
