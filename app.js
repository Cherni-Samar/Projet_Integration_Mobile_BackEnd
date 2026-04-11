require('dotenv').config();
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
const errorHandler = require('./middleware/errorHandler');
const staffingWatcher = require('./services/staffingWatcher');
const kashRoutes = require('./routes/kashRoutes');

// Import Kash Cron
const { startKashCron, triggerDailyEmailNow, triggerWeeklyEmailNow } = require('./cron/kashCron');

// Démarrer la surveillance autonome
staffingWatcher.watchStaffing();

const app = express();

// 1. Connexion MongoDB (Obligatoire)
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

// 3. Routes API
app.get('/', (req, res) => res.json({ status: 'running', service: 'Hera Assistant API' }));
app.get('/health', (req, res) => res.json({ status: 'OK', db: mongoose.connection.readyState === 1 }));

app.use('/api/auth', authRoutes);
app.use('/api/hera', heraRoutes);    // Route cruciale pour Vapi
app.use('/api/emails', emailRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/kash', kashRoutes);

// ✅ KASH CRON TEST ROUTES
app.get('/api/kash/test-daily', async (req, res) => {
  try {
    await triggerDailyEmailNow();
    res.json({ success: true, message: 'Daily email triggered' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/kash/test-weekly', async (req, res) => {
  try {
    await triggerWeeklyEmailNow();
    res.json({ success: true, message: 'Weekly email triggered' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Gestion des erreurs (404 & Global)
app.use((req, res) => res.status(404).json({ success: false, message: "Route non trouvée" }));
app.use(errorHandler);
app.use(cors()); 

// 5. Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Serveur lancé sur le port ${PORT}
📍 URL: http://localhost:${PORT}
🤖 Mode: ${process.env.NODE_ENV || 'production'}
  `);

  // 6. Start Kash Cron Job
  startKashCron();
});

module.exports = app;