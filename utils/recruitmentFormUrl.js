/**
 * Lien du formulaire candidature : posts LinkedIn Echo + affichage côté client.
 *
 * Ordre : ECHO_RECRUITMENT (si pas localhost) → PUBLIC_BASE_URL → URL ngrok détectée
 * → sinon localhost (.env). LinkedIn ne rend cliquables que les vraies URL https publiques.
 */

const http = require('http');

let discoveredPublicBase = null;

function isLocalhostUrl(url) {
  return /localhost|127\.0\.0\.1/i.test(String(url || ''));
}

function trimBase(u) {
  return String(u || '').trim().replace(/\/$/, '');
}

function setDiscoveredPublicBase(base) {
  discoveredPublicBase = base ? trimBase(base) : null;
}

/**
 * Si ngrok tourne (`ngrok http 3000`), son API locale expose l’URL https publique.
 * Sans ça, le lien dans .env reste localhost → pas cliquable pour les autres sur LinkedIn.
 */
function tryDiscoverNgrokPublicBase() {
  if (process.env.NGROK_AUTODISCOVER === 'false') {
    return Promise.resolve(null);
  }
  const port = process.env.NGROK_LOCAL_API_PORT || '4040';
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/tunnels`, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          const tunnels = j.tunnels || [];
          const httpsOne = tunnels.find((t) => t.proto === 'https');
          const first = httpsOne || tunnels[0];
          const url = first?.public_url ? trimBase(first.public_url) : null;
          resolve(url && !isLocalhostUrl(url) ? url : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * URL utilisée dans les textes générés (LinkedIn, etc.) — pas de req HTTP.
 */
function getRecruitmentFormUrl() {
  const echo = trimBase(process.env.ECHO_RECRUITMENT_FORM_URL);
  const pub = trimBase(process.env.PUBLIC_BASE_URL);
  const front = trimBase(process.env.FRONTEND_URL || 'http://localhost:3000');

  if (echo && !isLocalhostUrl(echo)) return echo;
  if (pub) return `${pub}/form`;
  if (discoveredPublicBase) return `${discoveredPublicBase}/form`;
  if (echo) return echo;
  return `${front}/form`;
}

function publicOriginFromRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '')
    .split(',')[0]
    .trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

/**
 * Lien à afficher / copier : préfère l’URL publique (tunnel) si tu ouvres le site via ngrok
 * alors que .env contient encore localhost.
 */
function recruitmentFormUrlForClientRequest(req) {
  const canonical = getRecruitmentFormUrl();
  const origin = publicOriginFromRequest(req);
  const fromReq = origin ? `${origin.replace(/\/$/, '')}/form` : '';

  if (!isLocalhostUrl(canonical)) return canonical;
  if (fromReq && !isLocalhostUrl(fromReq)) return fromReq;
  return canonical || fromReq;
}

function startNgrokDiscoveryRefresh() {
  if (process.env.NGROK_AUTODISCOVER === 'false') return;
  const raw = process.env.NGROK_DISCOVER_INTERVAL_MS;
  const ms = raw === undefined || raw === '' ? 120000 : Number(raw);
  if (!Number.isFinite(ms) || ms < 10000) return;
  setInterval(() => {
    tryDiscoverNgrokPublicBase().then((b) => {
      if (b) setDiscoveredPublicBase(b);
    });
  }, ms);
}

module.exports = {
  getRecruitmentFormUrl,
  recruitmentFormUrlForClientRequest,
  publicOriginFromRequest,
  isLocalhostUrl,
  tryDiscoverNgrokPublicBase,
  setDiscoveredPublicBase,
  startNgrokDiscoveryRefresh,
};
