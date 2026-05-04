require('dotenv').config();
const express = require('express');
const path = require('path'); // ✅ AJOUTÉ pour gérer les chemins de fichiers
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');

// 1. Initialize App First
const app = express();

// 2. Middlewares (CORS & Body Parsers)
const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://projet-integration-mobile-backend.onrender.com',
  process.env.FRONTEND_URL,
  process.env.PUBLIC_BASE_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (Postman, curl, direct HTML forms)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In development, allow everything
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    callback(new Error('CORS bloqué : ' + origin));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Import des Routes
const employeeAuthRoutes = require('./routes/employeeAuth');
const echoRoutes = require('./routes/echoRoutes');
const authRoutes = require('./routes/authRoutes');
const heraRoutes = require('./routes/heraRoutes');
const emailRoutes = require('./routes/emailRoutes');
const agentRoutes = require('./routes/agentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const kashRoutes = require('./routes/kashRoutes');
const activityRoutes = require('./routes/activityRoutes');
const dexoRoutes = require('./routes/dexoRoutes');

const errorHandler = require('./middleware/errorHandler');
const { startEchoSocialMediaAutonomy } = require('./services/echo/echoLinkedInAutonomy');
const ProductCampaignScheduler = require('./services/echo/productCampaignScheduler.service');
const { startKashCron, triggerDailyEmailNow, triggerWeeklyEmailNow } = require('./cron/kashCron');
const { startHeraActionCron } = require('./cron/heraActionCron');
const emailProcessorCron = require('./cron/emailProcessorCron');
require('./cron/automatedBriefing');

// 1. Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    
    // Start autonomous watchers AFTER MongoDB is connected
  // Wait 2 seconds after connection to ensure everything is ready
  })
  .catch((err) => {
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
  });

// -------------------------------------------------------------------------
// ✅ CONFIGURATION DES FICHIERS STATIQUES ET DU FORMULAIRE
// -------------------------------------------------------------------------
// Déclarer le dossier "public" (là où tu dois mettre ton form.html)
app.use(express.static(path.join(__dirname, 'public')));

// Route pour afficher le formulaire de candidature
const formHtmlPath = path.join(__dirname, 'public', 'form.html');
app.get('/form', (req, res) => res.sendFile(formHtmlPath));
app.get('/candidature', (req, res) => res.sendFile(formHtmlPath));

// Route pour afficher l'interface de configuration Echo
const echoConfigHtmlPath = path.join(__dirname, 'public', 'echo-config.html');
app.get('/echo-config', (req, res) => res.sendFile(echoConfigHtmlPath));
app.get('/echo/config', (req, res) => res.sendFile(echoConfigHtmlPath));

// Route pour afficher le dashboard principal
const dashboardHtmlPath = path.join(__dirname, 'public', 'dashboard.html');
app.get('/dashboard', (req, res) => res.sendFile(dashboardHtmlPath));
// -------------------------------------------------------------------------

// 3. Routes API
app.get('/', (req, res) => res.json({ status: 'running', service: 'Hera Assistant API' }));
app.get('/health', (req, res) => res.json({ status: 'OK', db: mongoose.connection.readyState === 1 }));

// ══════════════════════════════════════════════════════════════════════
// 🔧 DIAGNOSTIC — teste email + groq + env (utile sur Render)
// GET /api/diagnostic?email=test@example.com
// ══════════════════════════════════════════════════════════════════════
app.get('/api/diagnostic', async (req, res) => {
  const results = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    variables: {
      EMAIL_HOST:      process.env.EMAIL_HOST    || '❌ MANQUANT',
      EMAIL_PORT:      process.env.EMAIL_PORT    || '❌ MANQUANT',
      EMAIL_USER:      process.env.EMAIL_USER    ? '✅ ' + process.env.EMAIL_USER : '❌ MANQUANT',
      EMAIL_PASS:      process.env.EMAIL_PASS    ? `✅ défini (${process.env.EMAIL_PASS.length} chars)` : '❌ MANQUANT',
      RESEND_API_KEY:  process.env.RESEND_API_KEY ? '✅ défini' : '❌ MANQUANT',
      GROQ_API_KEY:    process.env.GROQ_API_KEY  ? `✅ défini (${process.env.GROQ_API_KEY.substring(0, 8)}...)` : '❌ MANQUANT',
      MONGODB_URI:     process.env.MONGODB_URI   ? '✅ défini' : '❌ MANQUANT',
      PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || '❌ MANQUANT',
      INTERVIEW_URL:   process.env.INTERVIEW_URL  || '❌ MANQUANT',
    },
    smtp:       { status: '⏳ test en cours...' },
    email_send: { status: '⏳ test en cours...' },
    groq:       { status: '⏳ test en cours...' },
    mongodb:    { status: mongoose.connection.readyState === 1 ? '✅ connecté' : '❌ déconnecté' }
  };

  // ── Test email (Resend ou SMTP) ──
  try {
    if (process.env.RESEND_API_KEY) {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const testEmail = req.query.email || process.env.EMAIL_USER;
      const fromAddr = process.env.RESEND_FROM || 'E-Team <onboarding@resend.dev>';
      results.smtp = { status: '✅ Resend API configuré (pas de SMTP)' };
      try {
        const r = await resend.emails.send({
          from: fromAddr,
          to: testEmail,
          subject: '🔧 [DIAGNOSTIC] Test email Render — E-Team',
          html: `<div style="font-family:sans-serif;padding:20px;border:2px solid #CCFF00;border-radius:12px;">
            <h2>✅ Email Render fonctionne via Resend !</h2>
            <p><b>Serveur :</b> ${process.env.PUBLIC_BASE_URL || 'localhost'}</p>
            <p><b>Heure :</b> ${new Date().toLocaleString('fr-FR')}</p>
          </div>`
        });
        if (r.error) throw new Error(r.error.message);
        results.email_send = { status: '✅ email envoyé via Resend', to: testEmail, id: r.data?.id };
      } catch (sendErr) {
        results.email_send = { status: '❌ échec Resend', error: sendErr.message };
      }
    } else {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: parseInt(process.env.EMAIL_PORT) === 465,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        tls: { rejectUnauthorized: false }
      });
      await transporter.verify();
      results.smtp = { status: '✅ connexion SMTP OK' };
      const testEmail = req.query.email || process.env.EMAIL_USER;
      try {
        const info = await transporter.sendMail({
          from: `"E-Team Diagnostic" <${process.env.EMAIL_USER}>`,
          to: testEmail,
          subject: '🔧 [DIAGNOSTIC] Test email Render — E-Team',
          html: `<div style="padding:20px;border:2px solid #CCFF00;border-radius:12px;">
            <h2>✅ Email Render fonctionne !</h2>
            <p><b>SMTP :</b> ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}</p>
            <p><b>Heure :</b> ${new Date().toLocaleString('fr-FR')}</p>
          </div>`
        });
        results.email_send = { status: '✅ email envoyé via SMTP', to: testEmail, messageId: info.messageId };
      } catch (sendErr) {
        results.email_send = { status: '❌ échec envoi SMTP', error: sendErr.message, code: sendErr.code };
      }
    }
  } catch (smtpErr) {
    results.smtp = { status: '❌ SMTP échoué', error: smtpErr.message, hint: 'Ajoute RESEND_API_KEY sur Render' };
    results.email_send = { status: '⏭️ ignoré' };
  }

  // ── Test Groq ──
  try {
    const { ChatGroq } = require('@langchain/groq');
    const llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
      maxTokens: 20
    });
    const resp = await llm.invoke('Réponds juste: OK');
    results.groq = { status: '✅ Groq API OK', response: resp.content?.substring(0, 50) };
  } catch (groqErr) {
    results.groq = { status: '❌ Groq API échouée', error: groqErr.message };
  }

  res.json(results);
});

// ✅ Auth routes (User registration & login)
app.use('/api/auth', authRoutes);

// ✅ Employee Auth routes (Employee portal login)
app.use('/api/employees', employeeAuthRoutes); 

app.use('/api/hera', heraRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/echo', echoRoutes);
app.use('/api/kash', kashRoutes);
app.use('/api/activities', activityRoutes);      
app.use('/api/dexo', dexoRoutes);


// ✅ KASH TEST ROUTES
app.get('/api/kash/test-daily', async (req, res) => {
  await triggerDailyEmailNow();
  res.json({ success: true, message: 'Daily email triggered' });
});
app.get('/api/kash/test-weekly', async (req, res) => {
  await triggerWeeklyEmailNow();
  res.json({ success: true, message: 'Weekly email triggered' });
});

// 4. Gestion des erreurs (DOIT ÊTRE APRÈS LES ROUTES)
app.use((req, res) => res.status(404).json({ success: false, message: "Route non trouvée" }));
app.use(errorHandler);

// 5. Démarrage du serveur et des Watchers
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Serveur lancé sur le port ${PORT}
📍 URL: http://localhost:${PORT}
🏢 Dashboard: http://localhost:${PORT}/dashboard
📋 Formulaire candidature : http://localhost:${PORT}/form
🔗 Configuration Echo : http://localhost:${PORT}/echo-config
🤖 Mode: ${process.env.NODE_ENV || 'development'}
  `);

  // Lancer les surveillances autonomes après le démarrage
  // staffingWatcher.watchStaffing(); // Moved to MongoDB connection callback
  startEchoSocialMediaAutonomy();
  // Lancer les cron jobs Kash
  startKashCron();
  // Lancer le cron job Hera (recruitment request processing)
  startHeraActionCron();
  // Lancer le scheduler de campagnes produit
  ProductCampaignScheduler.startScheduler();

  // ── CEO Email Intelligence System ──────────────────────────
  // Real-time mode is intentionally disabled until gmailPushNotifications.js
  // is available. Cron mode is the safe default.
  if (process.env.GMAIL_REALTIME_ENABLED !== 'true') {
    console.log('[Gmail] ⏰ Starting cron-based email processing (every 5 minutes)');
    emailProcessorCron.start();
  }
  // ────────────────────────────────────────────────────────────
});

module.exports = app;