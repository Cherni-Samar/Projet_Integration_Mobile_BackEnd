require('dotenv').config();
const express = require('express');
const path = require('path'); // ✅ AJOUTÉ pour gérer les chemins de fichiers
const cors = require('cors');
const mongoose = require('mongoose');

// 1. Initialize App First
const app = express();

// 2. Middlewares (CORS & Body Parsers)
app.use(cors({
  origin: 'http://localhost:4200',
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

const errorHandler = require('./middleware/errorHandler');
const staffingWatcher = require('./services/staffingWatcher');
const { startEchoSocialMediaAutonomy } = require('./services/echoLinkedInAutonomy');
const ProductCampaignScheduler = require('./services/productCampaignScheduler.service');
const { startKashCron, triggerDailyEmailNow, triggerWeeklyEmailNow } = require('./cron/kashCron');
require('./services/automatedBriefing');

// 1. Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    
    // Start autonomous watchers AFTER MongoDB is connected
    setTimeout(() => {
      console.log('🕵️ Starting autonomous watchers...');
      staffingWatcher.watchStaffing().catch(err => 
        console.error('❌ Staffing watcher error:', err.message)
      );
    }, 2000); // Wait 2 seconds after connection to ensure everything is ready
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

require('./services/automatedBriefing');

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
  // Lancer le scheduler de campagnes produit
  ProductCampaignScheduler.startScheduler();
});

module.exports = app;