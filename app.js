require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Import des Routes
const authRoutes = require('./routes/authRoutes');
const heraRoutes = require('./routes/heraRoutes');
const emailRoutes = require('./routes/emailRoutes');
const agentRoutes = require('./routes/agentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const echoRoutes = require('./routes/echoRoutes');  
const errorHandler = require('./middleware/errorHandler');
const staffingWatcher = require('./services/staffingWatcher');
const { startEchoSocialMediaAutonomy } = require('./services/echoLinkedInAutonomy');
const {
  getRecruitmentFormUrl,
  recruitmentFormUrlForClientRequest,
  isLocalhostUrl,
  tryDiscoverNgrokPublicBase,
  setDiscoveredPublicBase,
  startNgrokDiscoveryRefresh,
} = require('./utils/recruitmentFormUrl');

// La surveillance autonome est démarrée APRÈS la connexion MongoDB (voir app.listen)
startEchoSocialMediaAutonomy();

const app = express();

// 1. Connexion MongoDB (Obligatoire)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => {
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
  });

// 2. Middlewares de base
app.use(
  cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/echo', echoRoutes);  // ← AJOUTE CETTE LIGNE

// 3. Routes API
app.get('/', (req, res) => {
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  return res.json({
    status: 'running',
    service: 'Hera Assistant API',
    ui: `${req.protocol}://${req.get('host')}/index.html`,
    hint: 'Ouvre /index.html dans le navigateur ou envoie Accept: application/json pour ce JSON seul.',
  });
});
app.get('/health', (req, res) => res.json({ status: 'OK', db: mongoose.connection.readyState === 1 }));
// Aide debug Postman : confirme que c’est bien ce backend (pas un autre service sur :3000)
app.get('/api', (req, res) =>
  res.json({
    ok: true,
    service: 'pim-express',
    mounts: ['/api/auth', '/api/hera', '/api/emails', '/api/echo', '/api/agents', '/api/messages', '/api/payment'],
    tips: {
      linkedinAuth: 'GET /api/echo/linkedin/auth-url',
      receiveEmail: 'POST /api/emails/receive (JSON: subject + content)',
    },
  })
);

/** Pour l’app mobile : appelle cette URL avec la base que tu as configurée pour vérifier la connexion */
app.get('/api/client-config', (req, res) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const apiBaseUrl = `${proto}://${host}`;
  const recruitmentFormUrl = recruitmentFormUrlForClientRequest(req);
  const linkedInShareFormUrl = getRecruitmentFormUrl();
  res.json({
    ok: true,
    apiBaseUrl,
    recruitmentFormUrl,
    linkedInShareFormUrl,
    shareLinkIsPublic: !isLocalhostUrl(recruitmentFormUrl),
    linkedInFormIsPublic: !isLocalhostUrl(linkedInShareFormUrl),
    androidEmulatorHint: 'Remplace le host par 10.0.2.2 si tu es sur l’émulateur Android',
    sampleEndpoints: {
      health: `${apiBaseUrl}/health`,
      apiInfo: `${apiBaseUrl}/api`,
      echoSante: `${apiBaseUrl}/api/echo/sante`,
      form: `${apiBaseUrl}/form`,
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/hera', heraRoutes);    // Route cruciale pour Vapi
app.use('/api/emails', emailRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payment', paymentRoutes);

// Fichiers statiques (page de statut : /index.html) — index: false pour ne pas voler GET /
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,
  })
);

// Formulaire candidature (lien cliquable dans les posts LinkedIn recrutement Echo)
const formHtmlPath = path.join(__dirname, 'public', 'form.html');
app.get('/form', (req, res) => res.sendFile(formHtmlPath));
app.get('/candidature', (req, res) => res.sendFile(formHtmlPath));

// 4. Gestion des erreurs (404 & Global)
app.use((req, res) => res.status(404).json({ success: false, message: "Route non trouvée" }));
app.use(errorHandler);

// 5. Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  // ✅ Lancer le staffing watcher APRÈS que le serveur et MongoDB sont prêts
  console.log('🕵️ Lancement initial du staffing watcher...');
  staffingWatcher.watchStaffing().catch(err => console.error('staffingWatcher initial:', err.message));
  const ngrokBase = await tryDiscoverNgrokPublicBase();
  if (ngrokBase) {
    setDiscoveredPublicBase(ngrokBase);
    console.log(`\n✅ Ngrok détecté → lien candidature public (cliquable sur LinkedIn) : ${ngrokBase}/form\n`);
  }
  startNgrokDiscoveryRefresh();

  const recruitFormUrl = getRecruitmentFormUrl();
  if (isLocalhostUrl(recruitFormUrl)) {
    console.warn(
      '\n⚠️  Lien candidature = localhost → sur LinkedIn le texte ne sera pas un vrai lien pour les autres.\n' +
        '   1) Lance ngrok : ngrok http ' +
        PORT +
        ' (puis redémarre ce serveur), ou\n' +
        '   2) Mets dans .env : PUBLIC_BASE_URL=https://ton-tunnel.ngrok-free.app\n'
    );
  }
  console.log(`
🚀 Serveur lancé sur le port ${PORT}
📍 URL: http://localhost:${PORT}
📋 Formulaire (local) : http://localhost:${PORT}/form
🔗 URL utilisée dans les posts recrutement Echo : ${recruitFormUrl}
🤖 Mode: ${process.env.NODE_ENV || 'production'}
  `);
});

module.exports = app;