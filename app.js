require('dotenv').config();
const express = require('express');
const path = require('path'); // ✅ AJOUTÉ pour gérer les chemins de fichiers
const cors = require('cors');
const mongoose = require('mongoose');

// Import des Routes
const employeeAuthRoutes = require('./routes/employeeAuth');
const echoRoutes = require('./routes/echoRoutes');
const authRoutes = require('./routes/authRoutes');
const heraRoutes = require('./routes/heraRoutes');
const emailRoutes = require('./routes/emailRoutes');
const agentRoutes = require('./routes/agentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const errorHandler = require('./middleware/errorHandler');
const staffingWatcher = require('./services/staffingWatcher');
const { startEchoSocialMediaAutonomy } = require('./services/echoLinkedInAutonomy');
require('./services/automatedBriefing');

const app = express();

// 1. Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => {
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
  });

// 2. Middlewares de base
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// -------------------------------------------------------------------------
// ✅ CONFIGURATION DES FICHIERS STATIQUES ET DU FORMULAIRE
// -------------------------------------------------------------------------
// Déclarer le dossier "public" (là où tu dois mettre ton form.html)
app.use(express.static(path.join(__dirname, 'public')));

// Route pour afficher le formulaire de candidature
const formHtmlPath = path.join(__dirname, 'public', 'form.html');
app.get('/form', (req, res) => res.sendFile(formHtmlPath));
app.get('/candidature', (req, res) => res.sendFile(formHtmlPath));
// -------------------------------------------------------------------------

// 3. Routes API
app.get('/', (req, res) => res.json({ status: 'running', service: 'Hera Assistant API' }));
app.get('/health', (req, res) => res.json({ status: 'OK', db: mongoose.connection.readyState === 1 }));

app.use('/api/auth', authRoutes);
app.use('/api/hera', heraRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/employees', employeeAuthRoutes);
app.use('/api/echo', echoRoutes);      

// 4. Gestion des erreurs (DOIT ÊTRE APRÈS LES ROUTES)
app.use((req, res) => res.status(404).json({ success: false, message: "Route non trouvée" }));
app.use(errorHandler);

// 5. Démarrage du serveur et des Watchers
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Serveur lancé sur le port ${PORT}
📍 URL: http://localhost:${PORT}
📋 Formulaire candidature : http://localhost:${PORT}/form
🤖 Mode: ${process.env.NODE_ENV || 'development'}
  `);

  // Lancer les surveillances autonomes après le démarrage
  staffingWatcher.watchStaffing();
  startEchoSocialMediaAutonomy();
});

module.exports = app;