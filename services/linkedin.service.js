// services/linkedin.service.js — OAuth + publication UGC (membre)
const axios = require('axios');
const fs = require('fs');
const path = require('path');

/** Requis par LinkedIn sur la plupart des endpoints REST (évite me.GET.NO_VERSION / userinfo.GET.NO_VERSION) */
function linkedinHeaders(accessToken, extra = {}) {
  const ver = process.env.LINKEDIN_API_VERSION || '202411';
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': ver,
    ...extra,
  };
}

class LinkedInService {
  constructor() {
    this.clientId = process.env.LINKEDIN_CLIENT_ID || '';
    this.clientSecret = process.env.LINKEDIN_CLIENT_SECRET || '';
    this.redirectUri = process.env.LINKEDIN_REDIRECT_URI || '';
    this.tokenFile = process.env.LINKEDIN_TOKEN_PATH
      ? path.resolve(process.env.LINKEDIN_TOKEN_PATH)
      : path.join(__dirname, '../.linkedin_token.json');
    this.accessToken = null;
    this.idToken = null;
    this.personUrn = process.env.LINKEDIN_PERSON_URN || null;
    this.loadToken();
    console.log('[LinkedIn] Fichier token attendu :', this.tokenFile);
  }

  /** Relit .linkedin_token.json (utile après OAuth ou si le serveur a démarré avant le fichier). */
  refreshFromDisk() {
    this.accessToken = null;
    this.idToken = null;
    this.personUrn = process.env.LINKEDIN_PERSON_URN || null;
    this.loadToken();
  }

  tokenFileExists() {
    return fs.existsSync(this.tokenFile);
  }

  getSessionInfo() {
    this.refreshFromDisk();
    const exists = this.tokenFileExists();
    let fileHasAccessKey = false;
    if (exists) {
      try {
        const j = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
        fileHasAccessKey = !!(j && j.accessToken);
      } catch {
        /* ignore */
      }
    }
    let hint = null;
    if (!exists) {
      hint =
        "Aucun fichier token : le callback LinkedIn n'a pas atteint ce serveur OU l'échange code→token a échoué. 1) ngrok actif (ngrok http 3000) et LINKEDIN_REDIRECT_URI = URL ngrok exacte. 2) Sans ngrok : redirect LinkedIn = http://localhost:3000/api/echo/linkedin/callback et même valeur dans .env. 3) Copie le paramètre code de l'URL après login et POST /api/echo/linkedin/exchange avec { \"code\": \"...\" } (le code expire vite).";
    } else if (!fileHasAccessKey) {
      hint =
        'Fichier présent mais sans accessToken. Supprime le fichier et refais OAuth ou /exchange.';
    }
    return {
      success: true,
      hasAccessToken: !!this.accessToken,
      hasIdToken: !!this.idToken,
      hasPersonUrn: !!this.personUrn,
      personUrn: this.personUrn || null,
      apiVersion: process.env.LINKEDIN_API_VERSION || '202411',
      tokenFileExists: exists,
      tokenFileHasAccessToken: fileHasAccessKey,
      tokenFileAbsolutePath: this.tokenFile,
      tokenFilePathHint:
        'Défaut : projet/.linkedin_token.json — surcharge : LINKEDIN_TOKEN_PATH dans .env',
      hint,
    };
  }

  loadToken() {
    try {
      if (fs.existsSync(this.tokenFile)) {
        const data = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
        if (data.accessToken) this.accessToken = data.accessToken;
        if (data.idToken) this.idToken = data.idToken;
        if (data.personUrn) this.personUrn = data.personUrn;
        if (!this.personUrn && this.idToken) {
          const fromId = this.personUrnFromTokenJwt(this.idToken);
          if (fromId) this.personUrn = fromId;
        }
      }
    } catch {
      /* ignore */
    }
  }

  saveToken(token, extra = {}) {
    try {
      const payload = {
        accessToken: token,
        savedAt: new Date().toISOString(),
        ...extra,
      };
      if (this.idToken) payload.idToken = this.idToken;
      if (this.personUrn) payload.personUrn = this.personUrn;
      fs.writeFileSync(this.tokenFile, JSON.stringify(payload, null, 2));
      this.accessToken = token;
      console.log('[LinkedIn] Token sauvegardé :', this.tokenFile);
    } catch (e) {
      console.error('LinkedIn saveToken:', e.message);
    }
  }

  /** Scopes par défaut : openid + profile pour obtenir id_token / URN ; w_member_social pour publier.
   *  Dans l’app LinkedIn → Products : ajoute « Sign In with LinkedIn using OpenID Connect » ET « Share on LinkedIn ».
   *  Si unauthorized_scope_error : essaie LINKEDIN_SCOPES=w_member_social puis renseigne LINKEDIN_PERSON_URN à la main.
   */
  getScopeString() {
    const fromEnv = (process.env.LINKEDIN_SCOPES || '').trim();
    if (fromEnv) {
      return fromEnv.replace(/\s+/g, ' ');
    }
    return 'openid profile w_member_social';
  }

  getAuthUrl() {
    if (!this.clientId || !this.redirectUri) {
      return null;
    }
    const scope = encodeURIComponent(this.getScopeString());
    return (
      'https://www.linkedin.com/oauth/v2/authorization?' +
      `response_type=code&client_id=${encodeURIComponent(this.clientId)}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&scope=${scope}`
    );
  }

  async getAccessToken(code) {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      return { success: false, error: 'LINKEDIN_CLIENT_ID / SECRET / REDIRECT_URI manquants' };
    }
    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
      });
      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      const data = response.data;
      const token = data.access_token;
      this.accessToken = token;
      this.idToken = data.id_token || null;

      if (this.idToken) {
        const fromIdToken = this.personUrnFromTokenJwt(this.idToken);
        if (fromIdToken) this.personUrn = fromIdToken;
      }

      await this.resolveAndCachePersonUrn();
      this.saveToken(token, { personUrn: this.personUrn });
      if (!this.personUrn) {
        console.warn(
          'LinkedIn: URN membre non résolu. Ajoute openid+profile aux scopes et le produit OpenID sur l’app, ou LINKEDIN_PERSON_URN dans .env'
        );
      }
      return { success: true };
    } catch (error) {
      const err = error.response?.data || error.message;
      return { success: false, error: err };
    }
  }

  /** Certains access tokens LinkedIn sont des JWT avec claim sub = id membre */
  personUrnFromTokenJwt(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4;
      if (pad) b64 += '='.repeat(4 - pad);
      const json = Buffer.from(b64, 'base64').toString('utf8');
      const payload = JSON.parse(json);
      const sub = payload.sub;
      if (!sub || typeof sub !== 'string') return null;
      if (sub.startsWith('urn:li:person:')) return sub;
      return `urn:li:person:${sub}`;
    } catch {
      return null;
    }
  }

  /**
   * Si l’API profil refuse toujours (403), renseigne l’ID membre LinkedIn (souvent alphanumérique) ou l’URN complet.
   * Trouver l’ID : sur linkedin.com connecté, DevTools → Réseau, filtre « voyager », ouvre ton profil et cherche une réponse JSON contenant urn:li:person:…
   */
  setPersonUrn(personIdOrUrn) {
    let raw = String(personIdOrUrn || '').trim();
    if (!raw) return { success: false, error: 'personId ou personUrn requis' };
    if (raw.startsWith('urn:li:person:')) {
      this.personUrn = raw;
    } else {
      this.personUrn = `urn:li:person:${raw}`;
    }
    let data = {};
    if (fs.existsSync(this.tokenFile)) {
      try {
        data = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
      } catch {
        /* ignore */
      }
    }
    data.personUrn = this.personUrn;
    data.savedAt = new Date().toISOString();
    if (this.accessToken) data.accessToken = this.accessToken;
    if (this.idToken) data.idToken = this.idToken;
    fs.writeFileSync(this.tokenFile, JSON.stringify(data, null, 2));
    return { success: true, personUrn: this.personUrn };
  }

  async resolveAndCachePersonUrn() {
    if (this.personUrn) return this.personUrn;
    if (!this.accessToken) return null;

    const fromJwt = this.personUrnFromTokenJwt(this.accessToken);
    if (fromJwt) {
      this.personUrn = fromJwt;
      return this.personUrn;
    }

    try {
      const ver = process.env.LINKEDIN_API_VERSION || '202411';
      const r = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'LinkedIn-Version': ver,
        },
      });
      const id = r.data.sub;
      if (id) {
        this.personUrn = id.startsWith('urn:li:person:') ? id : `urn:li:person:${id}`;
        return this.personUrn;
      }
    } catch (e) {
      console.warn('LinkedIn userinfo:', e.response?.status, e.response?.data || e.message);
    }
    try {
      const r = await axios.get('https://api.linkedin.com/v2/me', {
        params: { projection: '(id)' },
        headers: linkedinHeaders(this.accessToken),
      });
      if (r.data?.id) {
        this.personUrn = `urn:li:person:${r.data.id}`;
        return this.personUrn;
      }
    } catch (e) {
      console.warn('LinkedIn /v2/me:', e.response?.status, e.response?.data || e.message);
    }
    return null;
  }

  /**
   * Upload une image sur LinkedIn et retourne l'image URN
   * @param {Buffer} imageBuffer - Le buffer de l'image
   * @returns {Promise<string|null>} - L'URN de l'image ou null
   */
  async uploadImage(imageBuffer) {
    if (!this.accessToken || !this.personUrn) return null;

    try {
      // 1. Initialiser l'upload
      const initResponse = await axios.post(
        'https://api.linkedin.com/rest/images?action=initializeUpload',
        {
          initializeUploadRequest: {
            owner: this.personUrn,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'LinkedIn-Version': '202504',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );

      const uploadUrl = initResponse.data.value.uploadUrl;
      const imageUrn = initResponse.data.value.image;

      // 2. Uploader le binaire
      await axios.put(uploadUrl, imageBuffer, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'image/png',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      console.log(`📷 [LINKEDIN] Image uploadée: ${imageUrn}`);
      return imageUrn;
    } catch (error) {
      console.warn('⚠️ LinkedIn image upload failed:', error.response?.data || error.message);
      return null;
    }
  }

  async post(message, imageBuffer) {
    this.refreshFromDisk();
    if (!this.accessToken) {
      return {
        success: false,
        error:
          "Pas de token LinkedIn. Ouvre GET /api/echo/linkedin/auth-url puis autorise l'app (le fichier .linkedin_token.json doit être à la racine du projet, là où tourne node).",
      };
    }
    const text = (message || '').trim();
    if (!text) {
      return { success: false, error: 'Contenu vide' };
    }
    if (text.length > 3000) {
      return { success: false, error: 'Texte trop long (max ~3000 caractères pour un test manuel)' };
    }

    let author = this.personUrn || (await this.resolveAndCachePersonUrn());
    if (!author && this.idToken) {
      author = this.personUrnFromTokenJwt(this.idToken);
      if (author) this.personUrn = author;
    }
    if (!author) {
      return {
        success: false,
        error:
          'URN membre introuvable. 1) Dans LinkedIn Developers → ton app → Products : active « Sign In with LinkedIn (OpenID) ». 2) Supprime .linkedin_token.json et refais OAuth (scopes par défaut : openid profile w_member_social). 3) Ou mets LINKEDIN_PERSON_URN=urn:li:person:TON_ID dans .env',
      };
    }

    try {
      // Upload image si fournie
      let imageUrn = null;
      if (imageBuffer) {
        imageUrn = await this.uploadImage(imageBuffer);
      }

      // Construire le contenu du post
      const shareContent = {
        shareCommentary: { text },
        shareMediaCategory: imageUrn ? 'IMAGE' : 'NONE',
      };

      // Ajouter l'image si elle a été uploadée
      if (imageUrn) {
        shareContent.media = [
          {
            status: 'READY',
            media: imageUrn,
          },
        ];
      }

      let response;

      if (imageUrn) {
        // ── POST avec image → utiliser /rest/posts (nouveau format REST) ──
        response = await axios.post(
          'https://api.linkedin.com/rest/posts',
          {
            author,
            commentary: text,
            visibility: 'PUBLIC',
            distribution: {
              feedDistribution: 'MAIN_FEED',
              targetEntities: [],
              thirdPartyDistributionChannels: [],
            },
            content: {
              media: {
                title: 'E-Team Publication',
                id: imageUrn,
              },
            },
            lifecycleState: 'PUBLISHED',
            isReshareDisabledByAuthor: false,
          },
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
              'LinkedIn-Version': '202504',
              'X-Restli-Protocol-Version': '2.0.0',
            },
          }
        );
      } else {
        // ── POST sans image → utiliser /v2/ugcPosts (ancien format) ──
        response = await axios.post(
          'https://api.linkedin.com/v2/ugcPosts',
          {
            author,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text },
                shareMediaCategory: 'NONE',
              },
            },
            visibility: {
              'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
            },
          },
          {
            headers: linkedinHeaders(this.accessToken, {
              'Content-Type': 'application/json',
            }),
          }
        );
      }

      if (this.accessToken && this.personUrn) {
        try {
          const raw = fs.existsSync(this.tokenFile)
            ? JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'))
            : {};
          this.saveToken(this.accessToken, { ...raw, personUrn: this.personUrn });
        } catch {
          /* ignore */
        }
      }
      return { success: true, postId: response.data?.id || response.headers?.['x-restli-id'] || 'published' };
    } catch (error) {
      const data = error.response?.data;
      console.error('LinkedIn ugcPosts:', data || error.message);
      return { success: false, error: data || error.message };
    }
  }
}

module.exports = new LinkedInService();